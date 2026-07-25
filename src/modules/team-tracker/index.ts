import type { TeamDiffEvent } from "rustminus";
import type { InGameCommand, RustModule } from "../types";
import { statusCommand } from "./status-command";

function describeChange(change: TeamDiffEvent): string | null {
    switch (change.type) {
        case "leaderChanged":
            return `👑 Team leader changed`;
        case "memberJoined":
            return `➕ ${change.member.name} joined the team`;
        case "memberLeft":
            return `➖ ${change.member.name} left the team`;
        case "memberDied":
            return `💀 ${change.member.name} died`;
        case "memberRespawned":
            return `✨ ${change.member.name} respawned`;
        case "memberWentOnline":
            return `🟢 ${change.member.name} is now online`;
        case "memberWentOffline":
            return `🔴 ${change.member.name} went offline`;
        default:
            return null;
    }
}

function statusReplyCommand(name: string, filter: (m: { isOnline: boolean; isAlive: boolean }) => boolean): InGameCommand {
    return {
        name,
        match: (body) => body.trim().toLowerCase() === `!${name}`,
        async execute({ rustplus, reply }) {
            const info = await rustplus.getTeamInfo();
            const members = info.members.filter(filter);
            await reply(members.length ? members.map((m) => m.name).join(", ") : "none");
        },
    };
}

export const teamTracker: RustModule = {
    id: "team-tracker",
    name: "Team Tracker",
    description: "Log team member join/leave/online/offline/death/respawn events, and check status in-game.",
    scope: "team",
    defaultEnabled: false,
    discordCommands: [statusCommand],
    inGameCommands: [
        statusReplyCommand("online", (m) => m.isOnline && m.isAlive),
        statusReplyCommand("offline", (m) => !m.isOnline && m.isAlive),
        statusReplyCommand("dead", (m) => !m.isAlive),
    ],
    async onTeamChanged({ team, changes }) {
        const channel = await team.getChannel("playerActivity");
        if (!channel) return;
        for (const change of changes) {
            const line = describeChange(change);
            if (line) await channel.send(line);
        }
    },
};
