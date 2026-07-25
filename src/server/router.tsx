import type { RouteObject } from "react-router-dom";
import Layout from "../client/layout/Layout";
import * as GuildLayout from "../client/layout/GuildLayout";
import Home from "../client/pages/Home";
import * as Guilds from "../client/pages/Guilds";
import * as GlobalModules from "../client/pages/GlobalModules";
import * as Modules from "../client/pages/Modules";
import * as Teams from "../client/pages/Teams";
import * as TeamDetail from "../client/pages/TeamDetail";
import * as TeamModules from "../client/pages/TeamModules";
import * as ServerDetail from "../client/pages/ServerDetail";
import * as PermissionGroups from "../client/pages/PermissionGroups";
import * as PermissionGroupDetail from "../client/pages/PermissionGroupDetail";
import { createGuildsLoader } from "./loaders/guilds";
import { createGuildLayoutLoader } from "./loaders/guildLayout";
import { createGlobalModulesLoader } from "./loaders/globalModules";
import { createModulesLoader } from "./loaders/modules";
import { createTeamsLoader } from "./loaders/teams";
import { createTeamDetailLoader } from "./loaders/teamDetail";
import { createTeamModulesLoader } from "./loaders/teamModules";
import { createServerDetailLoader } from "./loaders/serverDetail";
import { createPermissionGroupsLoader } from "./loaders/permissionGroups";
import { createPermissionGroupDetailLoader } from "./loaders/permissionGroupDetail";
import * as ChatLinks from "../client/pages/ChatLinks";
import { createChatLinksLoader } from "./loaders/chatLinks";

function NotFound() {
    return <div>404</div>;
}

/**
 * Mirrors src/client/router.tsx's paths exactly, but wires each route's `loader` to the
 * server-only dataAccess layer (in-process, no HTTP self-fetch) instead of the client's
 * fetch-based loader, and imports pages eagerly instead of via `lazy` (no code-splitting need
 * server-side - this only ever runs once per request under Bun, no bundle to split).
 * Never imported from src/client - that boundary is what keeps mongoose/discord.js out of the
 * browser bundle.
 */
export function createServerRoutes(cookieToken: string | undefined): RouteObject[] {
    return [
        {
            path: "/",
            Component: Layout,
            children: [
                { index: true, Component: Home },
                {
                    path: "guilds",
                    Component: Guilds.Component,
                    loader: createGuildsLoader(cookieToken),
                    ErrorBoundary: Guilds.ErrorBoundary,
                },
                {
                    path: "modules",
                    Component: GlobalModules.Component,
                    loader: createGlobalModulesLoader(cookieToken),
                    ErrorBoundary: GlobalModules.ErrorBoundary,
                },
                {
                    id: "guild",
                    path: "guild/:guildId",
                    Component: GuildLayout.Component,
                    loader: createGuildLayoutLoader(cookieToken),
                    ErrorBoundary: GuildLayout.ErrorBoundary,
                    children: [
                        {
                            path: "modules",
                            Component: Modules.Component,
                            loader: createModulesLoader(cookieToken),
                            ErrorBoundary: Modules.ErrorBoundary,
                        },
                        {
                            path: "teams",
                            Component: Teams.Component,
                            loader: createTeamsLoader(cookieToken),
                            ErrorBoundary: Teams.ErrorBoundary,
                        },
                        {
                            path: "teams/:teamId",
                            Component: TeamDetail.Component,
                            loader: createTeamDetailLoader(cookieToken),
                            ErrorBoundary: TeamDetail.ErrorBoundary,
                        },
                        {
                            path: "teams/:teamId/modules",
                            Component: TeamModules.Component,
                            loader: createTeamModulesLoader(cookieToken),
                            ErrorBoundary: TeamModules.ErrorBoundary,
                        },
                        {
                            path: "teams/:teamId/servers/:serverId",
                            Component: ServerDetail.Component,
                            loader: createServerDetailLoader(cookieToken),
                            ErrorBoundary: ServerDetail.ErrorBoundary,
                        },
                        {
                            path: "permissions",
                            Component: PermissionGroups.Component,
                            loader: createPermissionGroupsLoader(cookieToken),
                            ErrorBoundary: PermissionGroups.ErrorBoundary,
                        },
                        {
                            path: "permissions/:groupId",
                            Component: PermissionGroupDetail.Component,
                            loader: createPermissionGroupDetailLoader(cookieToken),
                            ErrorBoundary: PermissionGroupDetail.ErrorBoundary,
                        },
                        {
                            path: "chat-links",
                            Component: ChatLinks.Component,
                            loader: createChatLinksLoader(cookieToken),
                            ErrorBoundary: ChatLinks.ErrorBoundary,
                        },
                    ],
                },
                { path: "*", Component: NotFound },
            ],
        },
    ];
}
