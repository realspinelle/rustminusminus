import { PermissionFlagsBits } from "discord.js";
import { DiscordBot } from "../classes/DiscordBot";
import { OauthModel } from "../models/OAuth";
import { resolveGroupPermissionsByRoles } from "./check";
import type { PermissionId } from "./definitions";

/** True if the logged-in user is the bot owner (matched by OWNER_DISCORD_ID env var). */
export async function requireBotOwner(cookieToken: string | undefined): Promise<boolean> {
    const ownerId = Bun.env.OWNER_DISCORD_ID;
    if (!ownerId || !cookieToken) return false;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth?.userId) return false;
    return auth.userId.toString() === ownerId;
}

/** True if the logged-in user (by cookie) has Discord's MANAGE_GUILD permission on guildId. */
export async function requireGuildAdmin(cookieToken: string | undefined, guildId: string): Promise<boolean> {
    if (!cookieToken) return false;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth) return false;
    const guilds = await auth.getGuilds();
    if (!guilds) return false;
    const guild = guilds.find(g => g.id === guildId);
    if (!guild?.permissions) return false;
    return (BigInt(guild.permissions) & BigInt(PermissionFlagsBits.ManageGuild)) === BigInt(PermissionFlagsBits.ManageGuild);
}

/** True if the logged-in user (by cookie) is a guild admin, or holds `permission` via a role-linked permission group. */
export async function requirePermission(cookieToken: string | undefined, guildId: string, permission: PermissionId): Promise<boolean> {
    if (await requireGuildAdmin(cookieToken, guildId)) return true;
    if (!cookieToken) return false;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth?.userId) return false;
    const discordGuild = DiscordBot.Instance.guilds.cache.get(guildId);
    if (!discordGuild) return false;
    const discordUserId = auth.userId.toString();
    const member = discordGuild.members.cache.get(discordUserId)
        ?? await discordGuild.members.fetch(discordUserId).catch(() => null);
    if (!member) return false;
    const granted = await resolveGroupPermissionsByRoles(guildId, [...member.roles.cache.keys()]);
    return granted.has(permission);
}
