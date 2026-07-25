import { EmbedBuilder } from "discord.js";
import type { InGameCommand, RustModule } from "../types";
import { storageMonitorCommand } from "./storagemonitor-command";
import { displayName, findPairedItem } from "../../rustplus/pairedItems";
import { describeStoragePayload } from "../../rustplus/storageMonitors";
import { getItemCatalog } from "../../rustplus/itemCatalog";
import { upsertTrackedEmbed } from "../../discord/trackedEmbed";

function viewCommand(triggerWord: string): InGameCommand {
    return {
        name: `storagemonitor-view-${triggerWord}`,
        match: (body) => body.trim().toLowerCase().startsWith(`!${triggerWord} `),
        async execute({ rustplus, team, message, reply }) {
            const name = message.message.trim().slice(triggerWord.length + 2).trim();
            const server = team.servers.find((s) => s.serverId === team.activeServerId);
            if (!server) return await reply("No active server");
            const item = findPairedItem(server, "storageMonitor", name);
            if (!item) return await reply(`Can't find storage monitor "${name}"`);
            const catalog = await getItemCatalog();
            const entityInfo = await rustplus.getEntityInfo(Number(item.id));
            const entity = describeStoragePayload(item, entityInfo.payload, catalog);
            if (entity.kind === "cupboard") {
                await reply(entity.hasProtection ? `${entity.name}: protected` : `${entity.name}: not protected`);
                return;
            }
            const summary = entity.items.map((i) => `${i.quantity}x ${i.name}`).join(", ") || "empty";
            await reply(`${entity.name} (${entity.capacity} slots): ${summary}`);
        },
    };
}

export const storageMonitors: RustModule = {
    id: "storage-monitors",
    name: "Storage Monitors",
    description: "View and rename paired storage monitors/tool cupboards, with a live status embed.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [storageMonitorCommand],
    inGameCommands: [viewCommand("tc"), viewCommand("box")],
    async onEntityChanged({ team, entityId, payload }) {
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        const item = server?.pairedItems.storageMonitor.find((s) => s.id === String(entityId));
        if (!server || !item) return;

        const channel = await team.getChannel("storageMonitors");
        if (!channel) return;
        const catalog = await getItemCatalog();
        const entity = describeStoragePayload(item, payload, catalog);

        const embed = new EmbedBuilder().setTitle(displayName(item, "storageMonitor"));
        if (entity.kind === "cupboard") {
            embed.setDescription(entity.hasProtection ? "🛡️ Protected" : "⚠️ Not protected").setColor(entity.hasProtection ? 0x57f287 : 0xed4245);
        } else {
            const summary = entity.items.map((i) => `${i.quantity}x ${i.name}`).join("\n") || "empty";
            embed.setDescription(summary).setFooter({ text: `${entity.items.length} stack(s) / ${entity.capacity} slots` });
        }

        await upsertTrackedEmbed({
            channel,
            messages: team.discord.storageMonitors.messages,
            key: item.id,
            embed,
            persist: () => team.save(),
        });
    },
};
