import type { GuildClass } from "../../models/Guild";

/** Finds a team by id, scoped to the given guild so a teamId from another guild can't be used. */
export async function findGuildTeam(guild: GuildClass, teamId: string) {
    return (await guild.getTeams()).find(t => t._id.toString() === teamId) ?? null;
}

export function fail(status: number, error: string) {
    return { ok: false as const, status, error };
}

export function ok<T>(data: T) {
    return { ok: true as const, data };
}
