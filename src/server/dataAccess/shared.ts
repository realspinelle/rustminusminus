import { GuildModel, type GuildClass } from "../../models/Guild";
import type { TeamClass } from "../../models/Team";
import { registry } from "../../modules/ModuleRegistry";
import { requireGuildAdmin, requirePermission } from "../../permissions/web";
import type { PermissionId } from "../../permissions/definitions";

/** Finds a team by id, scoped to the given guild so a teamId from another guild can't be used. */
export async function findGuildTeam(guild: GuildClass, teamId: string) {
    return (await guild.getTeams()).find(t => t._id.toString() === teamId) ?? null;
}

/** Team-scoped module ids currently enabled for `team` - what the web dashboard uses to decide
 *  which module-owned sections/panels to render, mirroring Discord command visibility. */
export function enabledTeamModuleIds(team: TeamClass): string[] {
    return registry.all()
        .filter(mod => mod.scope === "team" && team.isModuleEnabled(mod.id))
        .map(mod => mod.id);
}

export function fail(status: number, error: string) {
    return { ok: false as const, status, error };
}

export function ok<T>(data: T) {
    return { ok: true as const, data };
}

async function resolveGuildAndTeam(guildId: string, teamId: string) {
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");
    return ok({ guild, team });
}

function requireModuleEnabledForTeam(moduleId: string, team: Awaited<ReturnType<typeof findGuildTeam>>) {
    if (!team || registry.isEnabledForTeam(moduleId, team)) return null;
    return fail(403, `${registry.get(moduleId)?.name ?? moduleId} is not enabled for this team`);
}

/**
 * Auth for a team-scoped module *action* that has a real Discord-side permission id (e.g.
 * renaming a device, setting the raid-alert radius) - permission-group-or-guild-admin
 * (`requirePermission`) plus the module being enabled for the team. Mirrors
 * `chatLinks.ts`'s `authAndGuild()`, generalized to team scope.
 */
export async function requireTeamModuleAccess(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    moduleId: string,
    permission: PermissionId,
) {
    if (!(await requirePermission(cookieToken, guildId, permission))) return fail(401, "Not authorized");
    const resolved = await resolveGuildAndTeam(guildId, teamId);
    if (!resolved.ok) return resolved;
    return requireModuleEnabledForTeam(moduleId, resolved.data.team) ?? resolved;
}

/**
 * Auth for a team-scoped module *read* action with no Discord-side permission gate of its own
 * (e.g. vending search, matching `/market`'s lack of a permission check) - guild-admin only,
 * plus the module being enabled for the team.
 */
export async function requireTeamModuleEnabled(
    cookieToken: string | undefined,
    guildId: string,
    teamId: string,
    moduleId: string,
) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) return fail(401, "Not authorized");
    const resolved = await resolveGuildAndTeam(guildId, teamId);
    if (!resolved.ok) return resolved;
    return requireModuleEnabledForTeam(moduleId, resolved.data.team) ?? resolved;
}
