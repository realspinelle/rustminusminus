import { DiscordBot } from "../../classes/DiscordBot";
import { GuildModel } from "../../models/Guild";
import { OauthModel } from "../../models/OAuth";
import { requireGuildAdmin } from "../../permissions/web";
import { fail, ok, findGuildTeam } from "./shared";

/** Best-effort display name for the logged-in dashboard user, for tagging a relayed chat
 *  message - falls back to a generic label rather than failing the send if it can't be resolved. */
async function resolveDisplayName(cookieToken: string | undefined, guildId: string): Promise<string> {
    if (!cookieToken) return "Dashboard user";
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth?.userId) return "Dashboard user";
    const discordGuild = DiscordBot.Instance.guilds.cache.get(guildId);
    const member = discordGuild?.members.cache.get(auth.userId)
        ?? await discordGuild?.members.fetch(auth.userId).catch(() => null);
    return member?.displayName ?? "Dashboard user";
}

/**
 * Sends a team chat message on behalf of the logged-in dashboard user. Always available when the
 * team is connected - independent of any module, same as chat-relay's own Discord-side relay
 * isn't permission-gated either, so this only requires the same guild-admin bar as viewing the
 * team page at all.
 */
export async function sendTeamChatMessage(cookieToken: string | undefined, guildId: string, teamId: string, message: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) return fail(401, "Not authorized");
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");

    const conn = team.getActiveRustPlus();
    if (!conn?.isConnected()) return fail(400, "This team isn't currently connected");

    const displayName = await resolveDisplayName(cookieToken, guildId);
    await conn.sendTeamMessage(`[Web] ${displayName}: ${message}`);
    return ok(null);
}
