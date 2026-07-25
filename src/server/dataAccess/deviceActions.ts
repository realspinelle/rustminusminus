import type { PermissionId } from "../../permissions/definitions";
import type { PairedItemKind } from "../../rustplus/pairedItems";
import { setPairedItemName } from "../../rustplus/pairedItems";
import { invalidateServerSnapshot } from "../../rustplus/serverSnapshot";
import { fail, ok, requireTeamModuleAccess } from "./shared";

const MODULE_AND_PERMISSION_BY_KIND: Record<PairedItemKind, { moduleId: string; permission: PermissionId }> = {
    smartSwitch: { moduleId: "smart-switches", permission: "switches.toggle" },
    smartAlarm: { moduleId: "smart-alarms", permission: "alarms.manage" },
    storageMonitor: { moduleId: "storage-monitors", permission: "storagemonitors.manage" },
};

export async function renameDevice(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    serverId: string,
    kind: PairedItemKind,
    entityId: string,
    name: string,
) {
    const { moduleId, permission } = MODULE_AND_PERMISSION_BY_KIND[kind];
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, moduleId, permission);
    if (!auth.ok) return auth;

    const renamed = await setPairedItemName(auth.data.team, serverId, kind, entityId, name);
    if (!renamed) return fail(404, "Device not found");
    invalidateServerSnapshot(auth.data.team._id, serverId);
    return ok(null);
}
