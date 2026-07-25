import { setRadiusMeters } from "../../modules/raid-alerts/settings";
import { ok, requireTeamModuleAccess } from "./shared";

export async function setRaidAlertRadius(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    meters: number,
) {
    const auth = await requireTeamModuleAccess(cookieToken, guildId, teamId, "raid-alerts", "raidalerts.manage");
    if (!auth.ok) return auth;

    await setRadiusMeters(auth.data.team, meters);
    return ok(null);
}
