import type { TeamClass } from "../../models/Team";

const MODULE_ID = "raid-alerts";
const DEFAULT_RADIUS_METERS = 100;

export function getRadiusMeters(team: TeamClass): number {
    const entry = team.modules?.find((m) => m.moduleId === MODULE_ID);
    const radius = entry?.settings?.radiusMeters;
    return typeof radius === "number" && radius > 0 ? radius : DEFAULT_RADIUS_METERS;
}

export async function setRadiusMeters(team: TeamClass, radiusMeters: number): Promise<void> {
    let entry = team.modules?.find((m) => m.moduleId === MODULE_ID);
    if (!entry) {
        entry = { moduleId: MODULE_ID, enabled: team.isModuleEnabled(MODULE_ID), settings: {} };
        team.modules.push(entry);
    }
    entry.settings.radiusMeters = radiusMeters;
    await team.save();
}
