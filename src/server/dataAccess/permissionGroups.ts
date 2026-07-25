import { PermissionGroupModel } from "../../models/PermissionGroup";
import { requireGuildAdmin } from "../../permissions/web";
import { fail, ok } from "./shared";

export async function getPermissionGroupsList(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const groups = await PermissionGroupModel.find({ guildId });
    return ok(groups.map(g => ({
        id: g._id.toString(),
        name: g.name,
        permissions: g.permissions,
        memberCount: g.getMembers().length,
    })));
}
