import { PermissionGroupModel } from "../models/PermissionGroup";
import type { PermissionId } from "./definitions";

/** Union of every permission granted by holding any of these Discord role ids in this guild. */
export async function resolveGroupPermissionsByRoles(guildId: string, roleIds: string[]): Promise<Set<PermissionId>> {
    if (!roleIds.length) return new Set();
    const groups = await PermissionGroupModel.find({ guildId, roleId: { $in: roleIds } });
    return new Set(groups.flatMap(g => g.permissions) as PermissionId[]);
}
