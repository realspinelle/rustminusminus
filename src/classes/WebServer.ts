import staticPlugin from "@elysiajs/static";
import Elysia from "elysia";
import { DiscordBot } from "./DiscordBot";
import axios from "axios";
import { Types } from "mongoose";
import { OauthClass, OauthModel } from "../models/OAuth";
import { GuildModel, type GuildClass } from "../models/Guild";
import { PermissionGroupModel, createPermissionGroup } from "../models/PermissionGroup";
import { registry } from "../modules/ModuleRegistry";
import { getActiveRustplus } from "../rustplus/connections";
import { getServerMap, getServerSnapshot, invalidateServerSnapshot } from "../rustplus/serverSnapshot";
import { requireGuildAdmin, requirePermission } from "../permissions/web";
import { PERMISSIONS } from "../permissions/definitions";
import type { PermissionId } from "../permissions/definitions";
import { findGuildTeam } from "../server/dataAccess/shared";
import { getGuildsForUser } from "../server/dataAccess/guilds";
import { getModulesData } from "../server/dataAccess/modules";
import { getTeamsList } from "../server/dataAccess/teams";
import { getTeamDetail, getAddableUsers } from "../server/dataAccess/teamDetail";
import { getServerDetail } from "../server/dataAccess/serverDetail";
import { getPermissionGroupsList } from "../server/dataAccess/permissionGroups";
import { getPermissionGroupDetail, getPermissionDefinitions, getAssignableMembers } from "../server/dataAccess/permissionGroupDetail";
import { getChatLinksList, createChatLink, deleteChatLink, addTeamToLink, removeTeamFromLink } from "../server/dataAccess/chatLinks";
import { getGuildEnabledModules } from "../server/dataAccess/guildLayout";
import { getGlobalModulesData } from "../server/dataAccess/globalModules";
import { getTeamModulesData } from "../server/dataAccess/teamModules";
import { requireBotOwner } from "../permissions/web";
import { renderPage } from "../server/render";

let REDIRECT_URI = Bun.env.PROTOCOL + "://" + Bun.env.HOST + ":" + Bun.env.PORT + "/callback"

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
                const { pathname } = new URL(request.url);
                if (pathname.startsWith("/public/js/") || pathname.startsWith("/public/css/")) {
                    // these URLs are version-stamped (see websiteBuilding.ts's getAssetVersion) - in dev
                    // the version changes on every request so no-store is still correct, in prod it only
                    // changes on an actual rebuild so the response itself can be cached indefinitely
                    set.headers["Cache-Control"] = Bun.env.NODE_ENV == "development"
                        ? "no-cache, no-store, must-revalidate"
                        : "public, max-age=31536000, immutable";
                } else {
                    set.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                    set.headers["Pragma"] = "no-cache";
                    set.headers["Expires"] = 0;
                }
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
            .get("*", async ({ redirect, loggedIn, cookieToken, request }) => {
                if (!loggedIn) return redirect("/login");
                return await renderPage(request, cookieToken as string | undefined);
            })
            .group("api", e =>
                e
                    .get("healthcheck", () => {
                        return { status: "ok" }
                    })
                    .get("modules", async ({ cookieToken, set }) => {
                        const result = await getGlobalModulesData(cookieToken as string | undefined);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .patch("modules/:moduleId", async ({ params, body, cookieToken, set }) => {
                        if (!(await requireBotOwner(cookieToken as string | undefined))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const { enabled } = body as { enabled: boolean };
                        await registry.setEnabled(params.moduleId, {}, enabled);
                        return { ok: true };
                    })
                    .get("guilds", async ({ cookieToken, set }) => {
                        const result = await getGuildsForUser(cookieToken as string | undefined);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .get("guilds/:guildId/enabled-modules", async ({ params, cookieToken, set }) => {
                        const result = await getGuildEnabledModules(cookieToken as string | undefined, params.guildId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .get("guilds/:guildId/modules", async ({ params, cookieToken, set }) => {
                        const result = await getModulesData(cookieToken as string | undefined, params.guildId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .patch("guilds/:guildId/modules/:moduleId", async ({ params, body, cookieToken, set }) => {
                        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "modules.manage"))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const { enabled } = body as { enabled: boolean };
                        await registry.setEnabled(params.moduleId, { guildId: params.guildId }, enabled);
                        return { ok: true };
                    })
                    .get("guilds/:guildId/teams/:teamId/modules", async ({ params, cookieToken, set }) => {
                        const result = await getTeamModulesData(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .patch("guilds/:guildId/teams/:teamId/modules/:moduleId", async ({ params, body, cookieToken, set }) => {
                        if (!(await requirePermission(cookieToken as string | undefined, params.guildId as string, "modules.manage"))) {
                            set.status = 401;
                            return { error: "Not authorized" };
                        }
                        const { enabled } = body as { enabled: boolean };
                        await registry.setEnabled(params.moduleId, { guildId: params.guildId, teamId: params.teamId }, enabled);
                        return { ok: true };
                    })
                    .get("guilds/:guildId/teams", async ({ params, cookieToken, set }) => {
                        const result = await getTeamsList(cookieToken as string | undefined, params.guildId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .get("guilds/:guildId/teams/:teamId", async ({ params, cookieToken, set }) => {
                        const result = await getTeamDetail(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
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
                        const result = await getAddableUsers(cookieToken as string | undefined, params.guildId as string, params.teamId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
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
                        const result = await getServerDetail(
                            cookieToken as string | undefined,
                            params.guildId as string,
                            params.teamId as string,
                            params.serverId as string,
                        );
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
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
                        // the map only changes on wipe - let the browser skip refetching it entirely for a while,
                        // overriding the global no-store default set in onRequest
                        set.headers["Cache-Control"] = "private, max-age=300";
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
                        invalidateServerSnapshot(team._id, params.serverId as string);
                        return { ok: true };
                    })
                    .get("guilds/:guildId/permission-groups/definitions", async ({ params, cookieToken, set }) => {
                        const result = await getPermissionDefinitions(cookieToken as string | undefined, params.guildId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .get("guilds/:guildId/permission-groups", async ({ params, cookieToken, set }) => {
                        const result = await getPermissionGroupsList(cookieToken as string | undefined, params.guildId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
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
                        const result = await getPermissionGroupDetail(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
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
                        const result = await getAssignableMembers(cookieToken as string | undefined, params.guildId as string, params.groupId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
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
                    .get("guilds/:guildId/chat-links", async ({ params, cookieToken, set }) => {
                        const result = await getChatLinksList(cookieToken as string | undefined, params.guildId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .post("guilds/:guildId/chat-links", async ({ params, body, cookieToken, set }) => {
                        const name = (body as { name?: string }).name?.trim();
                        if (!name) { set.status = 400; return { error: "Group name is required" }; }
                        const result = await createChatLink(cookieToken as string | undefined, params.guildId as string, name);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return result.data;
                    })
                    .delete("guilds/:guildId/chat-links/:linkId", async ({ params, cookieToken, set }) => {
                        const result = await deleteChatLink(cookieToken as string | undefined, params.guildId as string, params.linkId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return { ok: true };
                    })
                    .post("guilds/:guildId/chat-links/:linkId/teams", async ({ params, body, cookieToken, set }) => {
                        const teamId = (body as { teamId?: string }).teamId;
                        if (!teamId) { set.status = 400; return { error: "teamId is required" }; }
                        const result = await addTeamToLink(cookieToken as string | undefined, params.guildId as string, params.linkId as string, teamId);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
                        return { ok: true };
                    })
                    .delete("guilds/:guildId/chat-links/:linkId/teams/:teamId", async ({ params, cookieToken, set }) => {
                        const result = await removeTeamFromLink(cookieToken as string | undefined, params.guildId as string, params.linkId as string, params.teamId as string);
                        if (!result.ok) { set.status = result.status; return { error: result.error }; }
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