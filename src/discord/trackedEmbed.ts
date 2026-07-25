import type { EmbedBuilder, TextBasedChannel } from "discord.js";
import type { TrackedMessage } from "../models/Team";

/**
 * Keeps one live-updating embed per `key` in `channel`: edits the previously-sent message for
 * that key if it still exists, otherwise sends a new one and swaps the tracked id. `messages` is
 * the mongoose subdocument array to read/mutate in place (e.g. `team.discord.switches.messages`);
 * `persist` is called after mutating it (typically `() => team.save()`).
 */
export async function upsertTrackedEmbed(options: {
    channel: TextBasedChannel;
    messages: TrackedMessage[];
    key: string;
    embed: EmbedBuilder;
    persist: () => Promise<unknown>;
}): Promise<void> {
    const { channel, messages, key, embed, persist } = options;
    if (!channel.isSendable()) return;

    const existing = messages.find(m => m.key === key);
    if (existing) {
        try {
            await channel.messages.edit(existing.id, { embeds: [embed] });
            return;
        } catch {
            // message was deleted or otherwise unreachable - fall through and repost it below
        }
    }

    const sent = await channel.send({ embeds: [embed] });
    const remaining = messages.filter(m => m.key !== key);
    remaining.push({ id: sent.id, key });
    messages.length = 0;
    messages.push(...remaining);
    await persist();
}
