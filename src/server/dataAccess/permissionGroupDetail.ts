import { PermissionGroupModel } from "../../models/PermissionGroup";
import { requireGuildAdmin } from "../../permissions/web";
import { PERMISSIONS } from "../../permissions/definitions";
import { fail, ok } from "./shared";

export async function getPermissionGroupDetail(cookieToken: string | undefined, guildId: string, groupId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const group = await PermissionGroupModel.findOne({ _id: groupId, guildId });
    if (!group) return fail(404, "Permission group not found");
    return ok({
        id: group._id.toString(),
        name: group.name,
        permissions: group.permissions,
        discordUsers: group.getMembers(),
    });
}

export async function getPermissionDefinitions(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    return ok(PERMISSIONS);
}

export async function getAssignableMembers(cookieToken: string | undefined, guildId: string, groupId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const group = await PermissionGroupModel.findOne({ _id: groupId, guildId });
    if (!group) return fail(404, "Permission group not found");
    const discordGuild = group.getDiscordGuild();
    if (!discordGuild) return fail(404, "Discord server not found");
    const candidates = [];
    for (const member of discordGuild.members.cache.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(group.roleId)) continue;
        candidates.push({ userId: member.id, displayName: member.displayName });
    }
    return ok(candidates);
}
