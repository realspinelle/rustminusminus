import { EmbedBuilder } from "discord.js";
import type { RustModule } from "../types";
import { raidAlertCommand } from "./raidalert-command";
import { getRadiusMeters } from "./settings";
import { toGridReference } from "../../rustplus/gridReference";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export const raidAlerts: RustModule = {
    id: "raid-alerts",
    name: "Raid Alerts",
    description: "Ping the team when an explosion is detected near an online member.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [raidAlertCommand],
    async onMapEvent({ rustplus, team, guild, event }) {
        if (event.type !== "explosionSpawned") return;

        const radius = getRadiusMeters(team);
        const info = await rustplus.getTeamInfo();
        const nearby = info.members.filter((m) => m.isOnline && m.isAlive && distance(m, event.marker) <= radius);
        if (nearby.length === 0) return;

        let channelId = team.discord.events?.id;
        if (!channelId) channelId = (await guild.ensureEventsChannel(team)) ?? undefined;
        if (!channelId) return;
        const channel = guild.getDiscordGuild()?.channels.cache.get(channelId);
        if (!channel?.isSendable()) return;

        const serverInfo = await rustplus.getInfo();
        const grid = toGridReference(event.marker.x, event.marker.y, serverInfo.mapSize);
        const embed = new EmbedBuilder()
            .setTitle("🚨 Possible raid detected")
            .setDescription(`Explosion near ${nearby.map((m) => m.name).join(", ")} at grid ${grid}`)
            .setColor(0xed4245)
            .setTimestamp();
        await channel.send({ content: `<@&${team.discord.roleId}>`, embeds: [embed] });
    },
};
