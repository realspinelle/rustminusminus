import { GuildModel } from "../../models/Guild";
import { ServerModel } from "../../models/Server";
import { UserModel } from "../../models/User";
import { requireGuildAdmin } from "../../permissions/web";
import { fail, ok, findGuildTeam } from "./shared";
import { getSteamName } from "../../classes/SteamApi";

export async function getTeamDetail(cookieToken: string | undefined, guildId: string, teamId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    const users = await team.getUsers();
    const discordGuild = guild.getDiscordGuild();
    const memberIds = users.map(u => u.userId);
    const members = discordGuild && memberIds.length
        ? await discordGuild.members.fetch({ user: memberIds }).catch(() => discordGuild.members.cache)
        : null;
    const steamNames = await Promise.all(users.map(u => getSteamName(u.credentials.steam_id)));
    const servers = await Promise.all(team.servers.map(async s => {
        const server = await ServerModel.findOne({ serverId: s.serverId });
        return {
            serverId: s.serverId,
            name: server?.name ?? s.serverId,
            ip: server?.ip ?? null,
            port: server?.port ?? null,
            pairedItemCounts: {
                smartSwitch: s.pairedItems.smartSwitch.length,
                smartAlarm: s.pairedItems.smartAlarm.length,
                storageMonitor: s.pairedItems.storageMonitor.length,
            },
        };
    }));
    return ok({
        id: team._id.toString(),
        name: team.name,
        users: users.map((u, i) => ({
            id: u._id.toString(),
            userId: u.userId,
            displayName: members?.get(u.userId)?.displayName ?? null,
            steamId: u.credentials.steam_id,
            steamName: steamNames[i],
        })),
        activeServerId: team.activeServerId ?? null,
        activeCredentialUserId: team.activeCredentialUserId?.toString() ?? null,
        servers,
    });
}

export async function getAddableUsers(cookieToken: string | undefined, guildId: string, teamId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    const discordGuild = guild.getDiscordGuild();
    if (!discordGuild) return fail(404, "Discord server not found");
    const currentMemberIds = new Set(team.users.map(id => id.toString()));
    const linkedUsers = await UserModel.find();
    const candidateIds = linkedUsers
        .filter(u => !currentMemberIds.has(u._id.toString()))
        .map(u => u.userId);
    // members.cache is only whatever's been seen since the bot last restarted (interactions,
    // messages, etc.) - a member who linked credentials without triggering one of those in
    // this guild's cache window won't be there. Fetch the specific candidate ids instead of
    // trusting the cache, falling back to it only if the fetch itself fails.
    const members = candidateIds.length
        ? await discordGuild.members.fetch({ user: candidateIds }).catch(() => discordGuild.members.cache)
        : discordGuild.members.cache;
    const candidates = [];
    for (const u of linkedUsers) {
        if (currentMemberIds.has(u._id.toString())) continue;
        const member = members.get(u.userId);
        if (!member) continue;
        candidates.push({ userId: u.userId, displayName: member.displayName });
    }
    return ok(candidates);
}
