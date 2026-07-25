import staticPlugin from "@elysiajs/static";
import Elysia from "elysia";
import fs from "fs/promises";
import { DiscordBot } from "./DiscordBot";
import axios from "axios";
import { PermissionFlagsBits } from "discord.js";
import { Types } from "mongoose";
import { OauthClass, OauthModel } from "../models/OAuth";
import { GuildModel, type GuildClass } from "../models/Guild";
import { ServerModel } from "../models/Server";
import { UserModel } from "../models/User";
import { TeamModel } from "../models/Team";
import { PermissionGroupModel, createPermissionGroup } from "../models/PermissionGroup";
import { registry } from "../modules/ModuleRegistry";
import { getActiveRustplus } from "../rustplus/connections";
import { getServerMap, getServerSnapshot } from "../rustplus/serverSnapshot";
import { requireGuildAdmin, requirePermission } from "../permissions/web";
import { PERMISSIONS } from "../permissions/definitions";
import type { PermissionId } from "../permissions/definitions";

let REDIRECT_URI = Bun.env.PROTOCOL + "://" + Bun.env.HOST + ":" + Bun.env.PORT + "/callback"

/** Finds a team by id, scoped to the given guild so a teamId from another guild can't be used. */
async function findGuildTeam(guild: GuildClass, teamId: string) {
    return (await guild.getTeams()).find(t => t._id.toString() === teamId) ?? null;
}
export class WebServer extends Elysia {
    static websockets: any[] = []; // fck elysia types
    constructor() {
        super();
        if (Bun.env.NODE_ENV == "development") {
            this
                .ws('/ws', {
                    open(ws) {
                        WebServer.websockets.push(ws);
                    },
                    close(ws, code, reason) {
                        WebServer.websockets = WebServer.websockets.filter(e => e.id != ws.id);
                    },
                });
        }
        this
            .use(staticPlugin({}))
            .onRequest(async ({ set, request }) => {
                set.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                set.headers["Pragma"] = "no-cache";
                set.headers["Expires"] = 0;
                if (request.method === "OPTIONS") {
                    set.status = 204;
                    return "";
                }
            })
            .derive({ as: "global" }, async ({ cookie: { token } }) => {
                if (token?.value == undefined) {
                    let freeToken = await OauthClass.generateUniqueCookieId();
                    token?.set({
                        sameSite: "lax",
                        httpOnly: true,
                        secure: true,
                        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
                        value: freeToken
                    });
                    await OauthModel.create({
                        cookieId: freeToken
                    });
                    return { cookieToken: freeToken };
                }
                let auth = await OauthModel.findOne({ cookieId: token?.value });
                if (!auth) {
                    let freeToken = await OauthClass.generateUniqueCookieId();
                    token?.set({
                        sameSite: "lax",
                        httpOnly: true,
                        secure: true,
                        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
                        value: freeToken
                    });
                    await OauthModel.create({
                        cookieId: freeToken
                    });
                    return { cookieToken: freeToken };
                }
                return { cookieToken: token?.value };
            })
            .derive({ as: "global" }, async ({ cookieToken }) => {
                if (cookieToken == null) return { loggedIn: false };
                let auth = await OauthModel.findOne({ cookieId: cookieToken });
                if (!auth) return { loggedIn: false };
                if (!auth.accessToken) return { loggedIn: false };
                if (!auth.userId) return { loggedIn: false };
                if (!auth.expiration || auth.expiration < new Date()) return { loggedIn: false };
                if (await auth.getUser() == null) return { loggedIn: false };
                return { loggedIn: true };
            })
            .get("*", async ({ redirect, loggedIn }) => {
                if (!loggedIn) return redirect("/login");
                return new Response(await fs.readFile("./public/index.html"), {
                    headers: {
                        "Content-Type": "text/html"
                    }
                });
            })
            .group("api", e =>
                e
                    .get("healthcheck", () => {
                        return { status: "ok" }
                    })
                    .get("guilds", async ({ cookieToken, set }) => {
                        const auth = await OauthModel.findOne({ cookieId: cookieToken });
                        if (!auth) { set.status = 401; return { error: "Not logged in" }; }
                        const discordGuilds = await auth.getGuilds();
                        if (!discordGuilds) { set.status = 401; return { error: "Cant fetch guilds" }; }
                        const managed = discordGuilds.filter(g => {
                            if (!g.permissions) return false;
                            return (BigInt(g.permissions) & BigInt(PermissionFlagsBits.ManageGuild)) === BigInt(PermissionFlagsBits.ManageGuild);
                        });
                        const guildIds = new Set(managed.map(g => g.id));
                        if (auth.userId) {
                            const discordUserId = auth.userId.toString();
                            // guilds where this user holds a Discord role linked to a permission group
                            const otherGroups = await PermissionGroupModel.find({ guildId: { $nin: [...guildIds] } });
                            for (const g of otherGroups) {
                                if (guildIds.has(g.guildId)) continue;
                                const member = DiscordBot.Instance.guilds.cache.get(g.guildId)?.members.cache.get(discordUserId);
                                if (member?.roles.cache.has(g.roleId)) guildIds.add(g.guildId);
                            }
                            // guilds where this user is simply a member of a team - no permission needed to see the guild
                            const userDb = await UserModel.findOne({ userId: discordUserId });
                            if (userDb) {
                                const teams = await TeamModel.find({ users: userDb._id });
                                const teamIds = teams.map(t => t._id);
                                const teamGuilds = await GuildModel.find({ teams: { $in: teamIds } });
                                for (const g of teamGuilds) guildIds.add(g.guildId);
                            }
                        }
                        const dbGuilds = await GuildModel.find({ guildId: { $in: [...guildIds] } });
                        return dbGuilds.map(g => ({
                            guildId: g.guildId,
                            name: discordGuilds.find(m => m.id === g.guildId)?.name ?? g.guildId
                        }));
                    })
                    .get("guilds/:guildId/modules", async ({ params, cookieToken, set }) => {
                        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "modules.manage"))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const teams = await guild.getTeams();
                        const modules = registry.all().map(mod => ({
                            id: mod.id,
                            name: mod.name,
                            description: mod.description,
                            scope: mod.scope,
                            guildEnabled: guild.isModuleEnabled(mod.id),
                            teamEnabled: Object.fromEntries(teams.map(t => [t._id.toString(), t.isModuleEnabled(mod.id)])),
                            settingsSchema: mod.settingsSchema ?? [],
                        }));
                        return {
                            teams: teams.map(t => ({ id: t._id.toString(), name: t.name })),
                            modules,
                        };
                    })
                    .patch("guilds/:guildId/modules/:moduleId", async ({ params, body, cookieToken, set }) => {
                        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "modules.manage"))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const { enabled, teamId } = body as { enabled: boolean; teamId?: string };
                        await registry.setEnabled(params.moduleId, { guildId: params.guildId, teamId }, enabled);
                        return { ok: true };
                    })
                    .get("guilds/:guildId/teams", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const teams = await guild.getTeams();
                        return await Promise.all(teams.map(async t => {
                            const activeServer = t.activeServerId ? await ServerModel.findOne({ serverId: t.activeServerId }) : null;
                            return {
                                id: t._id.toString(),
                                name: t.name,
                                memberCount: t.users.length,
                                activeServerId: t.activeServerId ?? null,
                                activeServerName: activeServer?.name ?? t.activeServerId ?? null,
                            };
                        }));
                    })
                    .get("guilds/:guildId/teams/:teamId", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const users = await team.getUsers();
                        const servers = await Promise.all(team.servers.map(async s => {
                            const server = await ServerModel.findOne({ serverId: s.serverId });
                            return {
                                serverId: s.serverId,
                                name: server?.name ?? s.serverId,
                                ip: server?.ip ?? null,
                                port: server?.port ?? null,
                                pairedItemCounts: {
                                    smartSwitch: s.pairedItems.smartSwitch.length,
                                    smartAlarm: s.pairedItems.smartAlarm.length,
                                    storageMonitor: s.pairedItems.storageMonitor.length,
                                },
                            };
                        }));
                        return {
                            id: team._id.toString(),
                            name: team.name,
                            users: users.map(u => ({ id: u._id.toString(), userId: u.userId })),
                            activeServerId: team.activeServerId ?? null,
                            activeCredentialUserId: team.activeCredentialUserId?.toString() ?? null,
                            servers,
                        };
                    })
                    .post("guilds/:guildId/teams", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const name = (body as { name?: string }).name?.trim();
                        if (!name) { set.status = 400; return { error: "Team name is required" }; }
                        if (await guild.findTeamByName(name)) { set.status = 409; return { error: "A team with that name already exists" }; }
                        const created = await guild.createTeam(name);
                        if (!created) {
                            set.status = 500;
                            return { error: "Failed to create team — check the bot has Administrator permission in this server" };
                        }
                        return { ok: true };
                    })
                    .patch("guilds/:guildId/teams/:teamId/active-server", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const { serverId } = body as { serverId: string };
                        const result = await team.changeActiveServer(serverId);
                        if (result === false) { set.status = 400; return { error: "Active credential user has no access to that server" }; }
                        if (result === null) { set.status = 400; return { error: "No active credential user set for this team" }; }
                        return { ok: true };
                    })
                    .patch("guilds/:guildId/teams/:teamId/active-credential-user", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const { userId } = body as { userId: string };
                        const result = await team.changeActiveCredentialUser(new Types.ObjectId(userId));
                        if (result === false) { set.status = 400; return { error: "That user has no credentials for the active server" }; }
                        if (result === null) { set.status = 400; return { error: "Could not resolve active credential user" }; }
                        return { ok: true };
                    })
                    .get("guilds/:guildId/teams/:teamId/addable-users", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const discordGuild = guild.getDiscordGuild();
                        if (!discordGuild) { set.status = 404; return { error: "Discord server not found" }; }
                        const currentMemberIds = new Set(team.users.map(id => id.toString()));
                        const linkedUsers = await UserModel.find();
                        const candidateIds = linkedUsers
                            .filter(u => !currentMemberIds.has(u._id.toString()))
                            .map(u => u.userId);
                        // members.cache is only whatever's been seen since the bot last restarted (interactions,
                        // messages, etc.) - a member who linked credentials without triggering one of those in
                        // this guild's cache window won't be there. Fetch the specific candidate ids instead of
                        // trusting the cache, falling back to it only if the fetch itself fails.
                        const members = candidateIds.length
                            ? await discordGuild.members.fetch({ user: candidateIds }).catch(() => discordGuild.members.cache)
                            : discordGuild.members.cache;
                        const candidates = [];
                        for (const u of linkedUsers) {
                            if (currentMemberIds.has(u._id.toString())) continue;
                            const member = members.get(u.userId);
                            if (!member) continue;
                            candidates.push({ userId: u.userId, displayName: member.displayName });
                        }
                        return candidates;
                    })
                    .post("guilds/:guildId/teams/:teamId/members", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const { userId } = body as { userId: string };
                        const result = await team.addMember(userId);
                        if (!result.ok) { set.status = 400; return { error: result.error }; }
                        return { ok: true };
                    })
                    .get("guilds/:guildId/teams/:teamId/servers/:serverId", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const serverId = params.serverId as string;
                        const teamServer = team.servers.find(s => s.serverId === serverId);
                        if (!teamServer) { set.status = 404; return { error: "This team hasn't paired with that server" }; }
                        const serverDb = await ServerModel.findOne({ serverId });
                        const isActive = serverId === team.activeServerId;
                        // only auto-fetch live data for the active server (reuses the open connection, fast) -
                        // any other server requires an explicit /ping since that can be slow or fail
                        const live = isActive ? await getServerSnapshot(team, serverId) : null;
                        return {
                            serverId,
                            name: serverDb?.name ?? serverId,
                            img: serverDb?.img ?? null,
                            url: serverDb?.url ?? null,
                            ip: serverDb?.ip ?? null,
                            port: serverDb?.port ?? null,
                            isActive,
                            pairedItems: {
                                smartSwitch: teamServer.pairedItems.smartSwitch.map(s => s.id),
                                smartAlarm: teamServer.pairedItems.smartAlarm.map(a => a.id),
                                storageMonitor: teamServer.pairedItems.storageMonitor.map(s => s.id),
                            },
                            live: live && !("error" in live) ? live : null,
                            liveError: live && "error" in live ? live.error : null,
                        };
                    })
                    .post("guilds/:guildId/teams/:teamId/servers/:serverId/ping", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const result = await getServerSnapshot(team, params.serverId as string);
                        if ("error" in result) { set.status = 400; return { error: result.error }; }
                        return result;
                    })
                    .get("guilds/:guildId/teams/:teamId/servers/:serverId/map", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        const result = await getServerMap(team, params.serverId as string);
                        if ("error" in result) { set.status = 400; return { error: result.error }; }
                        return new Response(Buffer.from(result), { headers: { "Content-Type": "image/jpeg" } });
                    })
                    .post("guilds/:guildId/teams/:teamId/servers/:serverId/entities/:entityId/toggle", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const guild = await GuildModel.findOne({ guildId: params.guildId });
                        if (!guild) { set.status = 404; return { error: "Guild not found" }; }
                        const team = await findGuildTeam(guild, params.teamId as string);
                        if (!team) { set.status = 404; return { error: "Team not found" }; }
                        if (params.serverId !== team.activeServerId) {
                            set.status = 400;
                            return { error: "Only the active server's switches can be controlled" };
                        }
                        const conn = getActiveRustplus(team._id);
                        if (!conn) { set.status = 400; return { error: "Not connected to this server" }; }
                        const { value } = body as { value: boolean };
                        await conn.setEntityValue(Number(params.entityId), value);
                        return { ok: true };
                    })
                    .get("guilds/:guildId/permission-groups/definitions", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        return PERMISSIONS;
                    })
                    .get("guilds/:guildId/permission-groups", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const groups = await PermissionGroupModel.find({ guildId: params.guildId });
                        return groups.map(g => ({
                            id: g._id.toString(),
                            name: g.name,
                            permissions: g.permissions,
                            memberCount: g.getMembers().length,
                        }));
                    })
                    .post("guilds/:guildId/permission-groups", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const name = (body as { name?: string }).name?.trim();
                        if (!name) { set.status = 400; return { error: "Group name is required" }; }
                        const existing = await PermissionGroupModel.findOne({ guildId: params.guildId, name });
                        if (existing) { set.status = 409; return { error: "A permission group with that name already exists" }; }
                        const created = await createPermissionGroup(params.guildId as string, name);
                        if (!created) { set.status = 500; return { error: "Failed to create the group's Discord role — check the bot has Manage Roles permission" }; }
                        return { ok: true, id: created._id.toString() };
                    })
                    .get("guilds/:guildId/permission-groups/:groupId", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
                        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
                        return {
                            id: group._id.toString(),
                            name: group.name,
                            permissions: group.permissions,
                            discordUsers: group.getMembers(),
                        };
                    })
                    .patch("guilds/:guildId/permission-groups/:groupId", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
                        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
                        const { name, permissions } = body as { name?: string; permissions?: PermissionId[] };
                        if (name !== undefined) {
                            const trimmed = name.trim();
                            if (!trimmed) { set.status = 400; return { error: "Group name is required" }; }
                            group.name = trimmed;
                        }
                        if (permissions !== undefined) {
                            const validIds = new Set(PERMISSIONS.filter(p => p.status === "enforced").map(p => p.id));
                            group.permissions = permissions.filter(p => validIds.has(p));
                        }
                        await group.save();
                        return { ok: true };
                    })
                    .delete("guilds/:guildId/permission-groups/:groupId", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
                        if (group) await group.deleteWithRole();
                        return { ok: true };
                    })
                    .get("guilds/:guildId/permission-groups/:groupId/assignable-members", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
                        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
                        const discordGuild = group.getDiscordGuild();
                        if (!discordGuild) { set.status = 404; return { error: "Discord server not found" }; }
                        const candidates = [];
                        for (const member of discordGuild.members.cache.values()) {
                            if (member.user.bot) continue;
                            if (member.roles.cache.has(group.roleId)) continue;
                            candidates.push({ userId: member.id, displayName: member.displayName });
                        }
                        return candidates;
                    })
                    .post("guilds/:guildId/permission-groups/:groupId/members", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
                        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
                        const { userId } = body as { userId: string };
                        const result = await group.addMember(userId);
                        if (!result.ok) { set.status = 400; return { error: result.error }; }
                        return { ok: true };
                    })
                    .delete("guilds/:guildId/permission-groups/:groupId/members/:discordUserId", async ({ params, cookieToken, set }) => {
                        if (!(await requireGuildAdmin(cookieToken as string | undefined, params.guildId as string))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const group = await PermissionGroupModel.findOne({ _id: params.groupId, guildId: params.guildId });
                        if (!group) { set.status = 404; return { error: "Permission group not found" }; }
                        const result = await group.removeMember(params.discordUserId as string);
                        if (!result.ok) { set.status = 400; return { error: result.error }; }
                        return { ok: true };
                    })
            )
            .get("/login", async ({ redirect, loggedIn }) => {
                if (loggedIn) return redirect("/");
                const url = `https://discord.com/oauth2/authorize?client_id=${DiscordBot.Instance.user?.id}&redirect_uri=${encodeURIComponent(
                    REDIRECT_URI
                )}&response_type=code&scope=identify%20guilds`;
                return redirect(url);
            })
            .get("/callback", async ({ query, cookieToken, loggedIn, redirect }) => {
                if (loggedIn) return redirect("/");
                const code = query.code;

                const data = new URLSearchParams({
                    client_id: String(DiscordBot.Instance.user?.id),
                    client_secret: String(Bun.env.OAUTH_SECRET),
                    grant_type: "authorization_code",
                    code: code ?? "",
                    redirect_uri: REDIRECT_URI,
                });

                const tokenRes = await axios.post(
                    "https://discord.com/api/oauth2/token",
                    data.toString(),
                    {
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        validateStatus: () => true
                    }
                );
                if (tokenRes.status != 200) return redirect("/login");
                if (!tokenRes.data.scope.includes("identify") || !tokenRes.data.scope.includes("guilds")) return redirect("/login");
                const access_token = tokenRes.data.access_token;
                let auth = await OauthModel.findOne({ cookieId: cookieToken });
                if (!auth) return redirect("/login");
                auth.accessToken = access_token;
                auth.expiration = new Date(Date.now() + (tokenRes.data.expires_in * 1000));
                let user = await auth.getUser();
                auth.userId = user?.id;
                await auth.save();
                return redirect("/");
            });
    }
}