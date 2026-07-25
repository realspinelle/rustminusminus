import { EmbedBuilder } from "discord.js";
import type { InGameCommand, RustModule } from "../types";
import { switchCommand } from "./switch-command";
import { displayName, findPairedItem } from "../../rustplus/pairedItems";
import { upsertTrackedEmbed } from "../../discord/trackedEmbed";

const toggleCommand: InGameCommand = {
    name: "switch-toggle",
    match: (body) => /^!switch\s+(on|off)\s+.+/i.test(body.trim()),
    async execute({ rustplus, team, message, reply }) {
        const match = message.message.trim().match(/^!switch\s+(on|off)\s+(.+)$/i);
        if (!match) return;
        const [, action, name] = match as [string, "on" | "off", string];
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        if (!server) return await reply("No active server");
        const item = findPairedItem(server, "smartSwitch", name);
        if (!item) return await reply(`Can't find switch "${name}"`);
        await rustplus.setEntityValue(Number(item.id), action === "on");
        await reply(`Turned ${displayName(item, "smartSwitch")} ${action}`);
    },
};

const listCommand: InGameCommand = {
    name: "switch-list",
    match: (body) => body.trim().toLowerCase() === "!switches",
    async execute({ team, reply }) {
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const switches = server?.pairedItems.smartSwitch ?? [];
        await reply(switches.length ? switches.map((s) => displayName(s, "smartSwitch")).join(", ") : "No paired switches");
    },
};

export const smartSwitches: RustModule = {
    id: "smart-switches",
    name: "Smart Switches",
    description: "Toggle and rename paired smart switches from Discord and in-game chat.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [switchCommand],
    inGameCommands: [toggleCommand, listCommand],
    async onEntityChanged({ team, entityId, payload }) {
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const item = server?.pairedItems.smartSwitch.find((s) => s.id === String(entityId));
        if (!server || !item) return;

        const channel = await team.getChannel("switches");
        if (!channel) return;
        const embed = new EmbedBuilder()
            .setTitle(displayName(item, "smartSwitch"))
            .setDescription(payload.value ? "🟢 ON" : "🔴 OFF")
            .setColor(payload.value ? 0x57f287 : 0xed4245);
        await upsertTrackedEmbed({
            channel,
            messages: team.discord.switches.messages,
            key: item.id,
            embed,
            persist: () => team.save(),
        });
    },
};
