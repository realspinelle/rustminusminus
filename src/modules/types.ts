import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { AppEntityPayload, AppTeamInfo, AppTeamMessage, RustPlus, TeamDiffEvent } from "rustminus";
import type { GuildClass } from "../models/Guild";
import type { TeamClass } from "../models/Team";

/** Where a module can be toggled. A module declares its natural scope; the effective enabled
 *  check for a "team"-scoped module is: team override if present, else guild value, else
 *  defaultEnabled. */
export type ModuleScope = "global" | "guild" | "team";

export interface ModuleContext {
    rustplus: RustPlus;
    team: TeamClass;
    guild: GuildClass;
}

export interface InGameCommand {
    name: string;
    /** Return true if `body` (the raw team-chat message text) is this command. Runs per chat message. */
    match: (body: string) => boolean;
    execute: (
        ctx: ModuleContext & {
            message: AppTeamMessage;
            args: string;
            reply: (text: string) => Promise<void>;
        },
    ) => void | Promise<void>;
}

export interface ModuleDiscordCommand {
    name: string;
    slashCommand: SlashCommandBuilder;
    command: (interaction: ChatInputCommandInteraction) => void | Promise<void>;
}

export interface ModuleSettingField {
    key: string;
    label: string;
    type: "boolean" | "string" | "number" | "select";
    default?: unknown;
    options?: { label: string; value: string }[];
}

export interface RustModule {
    id: string;
    name: string;
    description: string;
    scope: ModuleScope;
    defaultEnabled: boolean;

    discordCommands?: ModuleDiscordCommand[];
    inGameCommands?: InGameCommand[];
    settingsSchema?: ModuleSettingField[];

    // ---- passive runtime hooks (only invoked while enabled for that team) ----
    onTeamMessage?(ctx: ModuleContext & { message: AppTeamMessage }): void | Promise<void>;
    onTeamChanged?(ctx: ModuleContext & { info: AppTeamInfo; changes: TeamDiffEvent[] }): void | Promise<void>;
    onEntityChanged?(ctx: ModuleContext & { entityId: number; payload: AppEntityPayload }): void | Promise<void>;

    // ---- lifecycle (fired on toggle) ----
    onEnable?(scope: { guildId: string; teamId?: string }): void | Promise<void>;
    onDisable?(scope: { guildId: string; teamId?: string }): void | Promise<void>;
}
