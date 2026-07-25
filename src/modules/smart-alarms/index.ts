import { EmbedBuilder } from "discord.js";
import type { InGameCommand, RustModule } from "../types";
import { alarmCommand } from "./alarm-command";
import { displayName } from "../../rustplus/pairedItems";

const listCommand: InGameCommand = {
    name: "alarm-list",
    match: (body) => body.trim().toLowerCase() === "!alarms",
    async execute({ team, reply }) {
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const alarms = server?.pairedItems.smartAlarm ?? [];
        await reply(alarms.length ? alarms.map((a) => displayName(a, "smartAlarm")).join(", ") : "No paired alarms");
    },
};

export const smartAlarms: RustModule = {
    id: "smart-alarms",
    name: "Smart Alarms",
    description: "Rename/list paired smart alarms and post an alert whenever one triggers.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [alarmCommand],
    inGameCommands: [listCommand],
    async onEntityChanged({ team, entityId, payload }) {
        if (payload.value !== true) return;
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const item = server?.pairedItems.smartAlarm.find((a) => a.id === String(entityId));
        if (!item) return;

        const channel = await team.getChannel("alarms");
        if (!channel || !channel.isSendable()) return;
        const embed = new EmbedBuilder()
            .setTitle(`🚨 ${displayName(item, "smartAlarm")} triggered!`)
            .setColor(0xed4245)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    },
};
