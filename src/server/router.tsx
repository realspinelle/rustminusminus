import type { RouteObject } from "react-router-dom";
import Layout from "../client/layout/Layout";
import Home from "../client/pages/Home";
import * as Guilds from "../client/pages/Guilds";
import * as Modules from "../client/pages/Modules";
import * as Teams from "../client/pages/Teams";
import * as TeamDetail from "../client/pages/TeamDetail";
import * as ServerDetail from "../client/pages/ServerDetail";
import * as PermissionGroups from "../client/pages/PermissionGroups";
import * as PermissionGroupDetail from "../client/pages/PermissionGroupDetail";
import { createGuildsLoader } from "./loaders/guilds";
import { createModulesLoader } from "./loaders/modules";
import { createTeamsLoader } from "./loaders/teams";
import { createTeamDetailLoader } from "./loaders/teamDetail";
import { createServerDetailLoader } from "./loaders/serverDetail";
import { createPermissionGroupsLoader } from "./loaders/permissionGroups";
import { createPermissionGroupDetailLoader } from "./loaders/permissionGroupDetail";

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
                    path: "guild/:guildId/modules",
                    Component: Modules.Component,
                    loader: createModulesLoader(cookieToken),
                    ErrorBoundary: Modules.ErrorBoundary,
                },
                {
                    path: "guild/:guildId/teams",
                    Component: Teams.Component,
                    loader: createTeamsLoader(cookieToken),
                    ErrorBoundary: Teams.ErrorBoundary,
                },
                {
                    path: "guild/:guildId/teams/:teamId",
                    Component: TeamDetail.Component,
                    loader: createTeamDetailLoader(cookieToken),
                    ErrorBoundary: TeamDetail.ErrorBoundary,
                },
                {
                    path: "guild/:guildId/teams/:teamId/servers/:serverId",
                    Component: ServerDetail.Component,
                    loader: createServerDetailLoader(cookieToken),
                    ErrorBoundary: ServerDetail.ErrorBoundary,
                },
                {
                    path: "guild/:guildId/permissions",
                    Component: PermissionGroups.Component,
                    loader: createPermissionGroupsLoader(cookieToken),
                    ErrorBoundary: PermissionGroups.ErrorBoundary,
                },
                {
                    path: "guild/:guildId/permissions/:groupId",
                    Component: PermissionGroupDetail.Component,
                    loader: createPermissionGroupDetailLoader(cookieToken),
                    ErrorBoundary: PermissionGroupDetail.ErrorBoundary,
                },
                { path: "*", Component: NotFound },
            ],
        },
    ];
}
