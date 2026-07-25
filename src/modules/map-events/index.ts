import { EmbedBuilder } from "discord.js";
import { AppMarkerType } from "rustminus";
import type { InGameCommand, RustModule } from "../types";
import type { MapMarkerEventType } from "../../rustplus/mapMarkerDiff";
import { eventsCommand } from "./events-command";
import { toGridReference } from "../../rustplus/gridReference";
import { EVENT_LABELS_BY_MARKER_TYPE } from "./labels";

const EVENT_DESCRIPTIONS: Record<MapMarkerEventType, { title: string; color: number }> = {
    cargoShipSpawned: { title: "🚢 Cargo Ship has spawned", color: 0x3498db },
    cargoShipDespawned: { title: "🚢 Cargo Ship has left", color: 0x99aab5 },
    patrolHelicopterSpawned: { title: "🚁 Patrol Helicopter inbound", color: 0xe67e22 },
    patrolHelicopterDespawned: { title: "🚁 Patrol Helicopter has despawned", color: 0x99aab5 },
    ch47Spawned: { title: "🛩️ Chinook spotted", color: 0xe67e22 },
    ch47Despawned: { title: "🛩️ Chinook has left", color: 0x99aab5 },
    crateSpawned: { title: "📦 Locked Crate spawned", color: 0xf1c40f },
    crateDespawned: { title: "📦 Locked Crate is gone", color: 0x99aab5 },
    explosionSpawned: { title: "💥 Explosion detected", color: 0xed4245 },
};

function locateCommand(triggerWord: string, markerType: AppMarkerType): InGameCommand {
    return {
        name: `map-events-${triggerWord}`,
        match: (body) => body.trim().toLowerCase() === `!${triggerWord}`,
        async execute({ rustplus, reply }) {
            const [markers, info] = await Promise.all([rustplus.getMapMarkers(), rustplus.getInfo()]);
            const active = markers.filter((m) => m.type === markerType);
            if (active.length === 0) return await reply("Not currently active");
            await reply(active.map((m) => toGridReference(m.x, m.y, info.mapSize)).join(", "));
        },
    };
}

const listCommand: InGameCommand = {
    name: "map-events-list",
    match: (body) => body.trim().toLowerCase() === "!events",
    async execute({ rustplus, reply }) {
        const [markers, info] = await Promise.all([rustplus.getMapMarkers(), rustplus.getInfo()]);
        const active = markers.filter((m) => m.type in EVENT_LABELS_BY_MARKER_TYPE);
        if (active.length === 0) return await reply("No active map events");
        await reply(active.map((m) => `${EVENT_LABELS_BY_MARKER_TYPE[m.type]} @ ${toGridReference(m.x, m.y, info.mapSize)}`).join(", "));
    },
};

export const mapEvents: RustModule = {
    id: "map-events",
    name: "Map Events",
    description: "Alert on cargo ship/patrol heli/chinook/crate/explosion spawns, with grid location.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [eventsCommand],
    inGameCommands: [
        locateCommand("cargo", AppMarkerType.CargoShip),
        locateCommand("heli", AppMarkerType.PatrolHelicopter),
        locateCommand("chinook", AppMarkerType.CH47),
        locateCommand("crate", AppMarkerType.Crate),
        listCommand,
    ],
    async onMapEvent({ rustplus, team, guild, event }) {
        let channelId = team.discord.events?.id;
        if (!channelId) channelId = (await guild.ensureEventsChannel(team)) ?? undefined;
        if (!channelId) return;
        const channel = guild.getDiscordGuild()?.channels.cache.get(channelId);
        if (!channel?.isSendable()) return;

        const info = await rustplus.getInfo();
        const grid = toGridReference(event.marker.x, event.marker.y, info.mapSize);
        const { title, color } = EVENT_DESCRIPTIONS[event.type];
        const embed = new EmbedBuilder().setTitle(title).setDescription(`Grid: ${grid}`).setColor(color).setTimestamp();
        await channel.send({ embeds: [embed] });
    },
};
