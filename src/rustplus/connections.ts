import { RustPlus } from "rustminus";
import type { Types } from "mongoose";
import type { TeamClass } from "../models/Team";
import { GuildModel } from "../models/Guild";
import { TeamModel } from "../models/Team";
import { registry } from "../modules/ModuleRegistry";

const activeConnections = new Map<string, RustPlus>(); // key: teamId.toString()

export async function connectTeam(
    team: TeamClass,
    ip: string,
    port: string,
    steamId: string,
    playerToken: string | number,
): Promise<RustPlus | undefined> {
    const rustplus = new RustPlus({
        server: ip,
        port: Number(port),
        playerId: steamId,
        playerToken: Number(playerToken),
        trackTeam: true,
    });
    try {
        await rustplus.connect();
    } catch (error) {
        console.log("failed to connect rustplus for team", team._id, error);
        return undefined;
    }
    activeConnections.set(team._id.toString(), rustplus);
    const guild = await team.getGuild();
    if (guild) registry.attach(rustplus, team, guild);

    // Rust+ has no queryable "last triggered" for alarms - the only way to know is to catch the
    // live broadcast while connected, so this only tracks alarms on a team's currently-active
    // server. Re-fetches the team fresh rather than mutating the closed-over `team` so a
    // concurrent write (e.g. a new device being paired) isn't clobbered.
    rustplus.on("entityChanged", async (entityId, payload) => {
        if (payload.value !== true) return;
        const freshTeam = await TeamModel.findById(team._id);
        const server = freshTeam?.servers.find(s => s.serverId === freshTeam.activeServerId);
        const alarm = server?.pairedItems.smartAlarm.find(a => a.id === String(entityId));
        if (!alarm) return;
        alarm.lastTriggered = new Date();
        await freshTeam!.save();
    });

    return rustplus;
}

export function disconnectTeam(teamId: Types.ObjectId): void {
    const conn = activeConnections.get(teamId.toString());
    if (!conn) return;
    conn.disconnect();
    registry.detach(conn);
    activeConnections.delete(teamId.toString());
}

export function getActiveRustplus(teamId: Types.ObjectId): RustPlus | undefined {
    return activeConnections.get(teamId.toString());
}

export async function connectAll(): Promise<void> {
    const guilds = await GuildModel.find();
    for (const guild of guilds) {
        for (const t of guild.teams) {
            const team = await TeamModel.findOne({ id: t._id });
            await team?.connectRustPlus();
        }
    }
}
