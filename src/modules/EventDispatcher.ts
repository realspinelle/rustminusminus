import type { AppEntityPayload, AppTeamInfo, AppTeamMessage, RustPlus, TeamDiffEvent } from "rustminus";
import type { GuildClass } from "../models/Guild";
import type { TeamClass } from "../models/Team";
import type { ModuleLookup } from "./EnablementCache";

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
 * Owns the listener lifecycle for each live RustPlus connection and dispatches its events to
 * whichever modules are enabled for that connection's team - checked fresh via
 * `enabledModuleIdsForTeam` on every event, not baked in at attach time. One listener set per
 * connection, attached once at connect and never touched on toggle - toggling only mutates the
 * enabled-set cache these listeners read each time, which is what makes toggling live with no
 * listener leaks or bot restart required.
 */
export class EventDispatcher {
    private connectionListeners = new Map<RustPlus, ConnectionListeners>();
    private connectionContext = new Map<RustPlus, ConnectionContext>();

    constructor(
        private readonly modules: ModuleLookup,
        private readonly enabledModuleIdsForTeam: (teamId: string) => Set<string>,
    ) {}

    attach(rustplus: RustPlus, team: TeamClass, guild: GuildClass): void {
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
        const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
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
        const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
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
        const enabled = this.enabledModuleIdsForTeam(ctx.team._id.toString());
        for (const moduleId of enabled) {
            const mod = this.modules.get(moduleId);
            if (mod?.onEntityChanged) {
                await mod.onEntityChanged({ rustplus, team: ctx.team, guild: ctx.guild, entityId, payload });
            }
        }
    }
}
