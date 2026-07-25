import type { RustModule } from "../types";

export const chatRelay: RustModule = {
    id: "chat-relay",
    name: "Chat Relay",
    description: "Bridge in-game team chat and the team's Discord channel in both directions.",
    scope: "team",
    defaultEnabled: false,
    async onTeamMessage({ rustplus, team, message }) {
        if (message.steamId === rustplus.playerId) return; // our own Discord->game relay echo, see DiscordBot.ts's MessageCreate handler
        const channel = await team.getChannel("teamChat");
        if (!channel?.isSendable()) return;
        await channel.send(`**${message.name}**: ${message.message}`);
    },
};
