import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { resolveGroupPermissionsByRoles } from "./check";
import type { PermissionId } from "./definitions";

/** True if the interacting member has Discord's MANAGE_GUILD permission, or holds `permission` via a role-linked permission group. */
export async function hasDiscordPermission(interaction: ChatInputCommandInteraction, permission: PermissionId): Promise<boolean> {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
    if (!interaction.guildId) return false;
    const member = interaction.guild?.members.cache.get(interaction.user.id)
        ?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return false;
    const granted = await resolveGroupPermissionsByRoles(interaction.guildId, [...member.roles.cache.keys()]);
    return granted.has(permission);
}
