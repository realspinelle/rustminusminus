import type { AppEntityPayload, AppTeamInfo, AppTeamMessage, RustPlus, TeamDiffEvent } from "rustminus";
import { DiscordBot } from "../classes/DiscordBot";
import { GuildModel, type GuildClass } from "../models/Guild";
import { TeamModel, type TeamClass } from "../models/Team";
import type { ModuleDiscordCommand, RustModule } from "./types";

interface ConnectionListeners {
    onTeamMessage: (message: AppTeamMessage) => void;
    onTeamChanged: (info: AppTeamInfo, changes: TeamDiffEvent[]) => void;
    onEntityChanged: (entityId: number, payload: AppEntityPayload) => void;
}

interface ConnectionContext {
    team: TeamClass;
    guild: GuildClass;
}

/**
 * Central module registry: owns which modules exist, whether they're enabled for a given
 * team/guild (via in-memory caches kept fresh on toggle - see setEnabled), and dispatches
 * rustminus events to the modules that are actually enabled for that connection.
 *
 * One listener set per RustPlus connection, attached once at connect (see attach()) and never
 * touched on toggle - toggling only mutates the enabled-set caches the listeners read each time,
 * which is what makes toggling live with no listener leaks or bot restart required.
 */
class ModuleRegistry {
    private modules = new Map<string, RustModule>();
    private teamEnabled = new Map<string, Set<string>>(); // teamId.toString() -> enabled moduleIds (effective)
    private guildEnabled = new Map<string, Set<string>>(); // guildId (Discord guild id string) -> enabled moduleIds
    private connectionListeners = new Map<RustPlus, ConnectionListeners>();
    private connectionContext = new Map<RustPlus, ConnectionContext>();

    register(mod: RustModule): void {
        this.modules.set(mod.id, mod);
    }

    all(): RustModule[] {
        return [...this.modules.values()];
    }

    get(id: string): RustModule | undefined {
        return this.modules.get(id);
    }

    /** Effective per-team enabled set: team override, else guild override, else module default. */
    private computeTeamEnabledSet(team: TeamClass, guild: GuildClass): Set<string> {
        const set = new Set<string>();
        for (const mod of this.all()) {
            const teamOverride = team.modules?.find((m) => m.moduleId === mod.id);
            const guildOverride = guild.modules?.find((m) => m.moduleId === mod.id);
            const enabled = teamOverride ? teamOverride.enabled : guildOverride ? guildOverride.enabled : mod.defaultEnabled;
            if (enabled) set.add(mod.id);
        }
        return set;
    }

    /** Guild-level enabled set, used to gate per-guild Discord command registration. */
    private computeGuildEnabledSet(guild: GuildClass): Set<string> {
        const set = new Set<string>();
        for (const mod of this.all()) {
            const guildOverride = guild.modules?.find((m) => m.moduleId === mod.id);
            const enabled = guildOverride ? guildOverride.enabled : mod.defaultEnabled;
            if (enabled) set.add(mod.id);
        }
        return set;
    }

    primeGuild(guild: GuildClass): void {
        this.guildEnabled.set(guild.guildId, this.computeGuildEnabledSet(guild));
    }

    isEnabledForTeam(moduleId: string, team: TeamClass): boolean {
        return this.teamEnabled.get(team._id.toString())?.has(moduleId) ?? false;
    }

    isEnabledForGuild(moduleId: string, guildId: string): boolean {
        return this.guildEnabled.get(guildId)?.has(moduleId) ?? false;
    }

    /** Union of module command names enabled for a guild, for per-guild slash command registration. */
    discordCommandNamesForGuild(guildId: string): Set<string> {
        const enabled = this.guildEnabled.get(guildId) ?? new Set<string>();
        const names = new Set<string>();
        for (const mod of this.all()) {
            if (!enabled.has(mod.id)) continue;
            for (const cmd of mod.discordCommands ?? []) names.add(cmd.name);
        }
        return names;
    }

    /** Map of Discord command name -> owning module, for interaction dispatch. */
    moduleDiscordCommandOwners(): Map<string, RustModule> {
        const map = new Map<string, RustModule>();
        for (const mod of this.all()) {
            for (const cmd of mod.discordCommands ?? []) map.set(cmd.name, mod);
        }
        return map;
    }

    /** Flat list of every module-owned Discord command, regardless of guild/enabled state. */
    allDiscordCommands(): ModuleDiscordCommand[] {
        return this.all().flatMap((mod) => mod.discordCommands ?? []);
    }

    attach(rustplus: RustPlus, team: TeamClass, guild: GuildClass): void {
        this.teamEnabled.set(team._id.toString(), this.computeTeamEnabledSet(team, guild));
        this.primeGuild(guild);
        this.connectionContext.set(rustplus, { team, guild });

        const onTeamMessage = (message: AppTeamMessage) => void this.dispatchTeamMessage(rustplus, message);
        const onTeamChanged = (info: AppTeamInfo, changes: TeamDiffEvent[]) =>
            void this.dispatchTeamChanged(rustplus, info, changes);
        const onEntityChanged = (entityId: number, payload: AppEntityPayload) =>
            void this.dispatchEntityChanged(rustplus, entityId, payload);

        rustplus.on("teamMessage", onTeamMessage);
        rustplus.on("teamChanged", onTeamChanged);
        rustplus.on("entityChanged", onEntityChanged);
        this.connectionListeners.set(rustplus, { onTeamMessage, onTeamChanged, onEntityChanged });
    }

    detach(rustplus: RustPlus): void {
        const listeners = this.connectionListeners.get(rustplus);
        if (listeners) {
            rustplus.off("teamMessage", listeners.onTeamMessage);
            rustplus.off("teamChanged", listeners.onTeamChanged);
            rustplus.off("entityChanged", listeners.onEntityChanged);
        }
        this.connectionListeners.delete(rustplus);
        this.connectionContext.delete(rustplus);
    }

    private async dispatchTeamMessage(rustplus: RustPlus, message: AppTeamMessage): Promise<void> {
        const ctx = this.connectionContext.get(rustplus);
        if (!ctx) return;
        const enabled = this.teamEnabled.get(ctx.team._id.toString()) ?? new Set<string>();
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (!mod) continue;
            for (const cmd of mod.inGameCommands ?? []) {
                if (cmd.match(message.message)) {
                    await cmd.execute({
                        rustplus,
                        team: ctx.team,
                        guild: ctx.guild,
                        message,
                        args: message.message,
                        reply: (text: string) => rustplus.sendTeamMessage(text),
                    });
                }
            }
            if (mod.onTeamMessage) {
                await mod.onTeamMessage({ rustplus, team: ctx.team, guild: ctx.guild, message });
            }
        }
    }

    private async dispatchTeamChanged(rustplus: RustPlus, info: AppTeamInfo, changes: TeamDiffEvent[]): Promise<void> {
        const ctx = this.connectionContext.get(rustplus);
        if (!ctx) return;
        const enabled = this.teamEnabled.get(ctx.team._id.toString()) ?? new Set<string>();
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (mod?.onTeamChanged) {
                await mod.onTeamChanged({ rustplus, team: ctx.team, guild: ctx.guild, info, changes });
            }
        }
    }

    private async dispatchEntityChanged(rustplus: RustPlus, entityId: number, payload: AppEntityPayload): Promise<void> {
        const ctx = this.connectionContext.get(rustplus);
        if (!ctx) return;
        const enabled = this.teamEnabled.get(ctx.team._id.toString()) ?? new Set<string>();
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (mod?.onEntityChanged) {
                await mod.onEntityChanged({ rustplus, team: ctx.team, guild: ctx.guild, entityId, payload });
            }
        }
    }

    /**
     * Persists a module's enabled state, refreshes the relevant cache(s), fires the module's
     * onEnable/onDisable lifecycle hook, and re-syncs that guild's Discord slash commands live.
     */
    async setEnabled(moduleId: string, scope: { guildId: string; teamId?: string }, enabled: boolean): Promise<void> {
        if (scope.teamId) {
            const team = await TeamModel.findById(scope.teamId);
            if (!team) return;
            const existing = team.modules?.find((m) => m.moduleId === moduleId);
            if (existing) existing.enabled = enabled;
            else team.modules.push({ moduleId, enabled, settings: {} });
            await team.save();
            const guild = await team.getGuild();
            if (guild) this.teamEnabled.set(team._id.toString(), this.computeTeamEnabledSet(team, guild));
        } else {
            const guild = await GuildModel.findOne({ guildId: scope.guildId });
            if (!guild) return;
            const existing = guild.modules?.find((m) => m.moduleId === moduleId);
            if (existing) existing.enabled = enabled;
            else guild.modules.push({ moduleId, enabled, settings: {} });
            await guild.save();
            this.primeGuild(guild);
        }

        const mod = this.modules.get(moduleId);
        if (enabled) await mod?.onEnable?.(scope);
        else await mod?.onDisable?.(scope);

        await DiscordBot.Instance.registerGuildCommands(scope.guildId);
    }
}

export const registry = new ModuleRegistry();
