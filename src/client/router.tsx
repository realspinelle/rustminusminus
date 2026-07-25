import type { RouteObject } from "react-router-dom";
import Layout from "./layout/Layout";
import * as GuildLayout from "./layout/GuildLayout";
import Home from "./pages/Home";
import * as Guilds from "./pages/Guilds";
import * as GlobalModules from "./pages/GlobalModules";
import * as Modules from "./pages/Modules";
import * as Teams from "./pages/Teams";
import * as TeamDetail from "./pages/TeamDetail";
import * as TeamModules from "./pages/TeamModules";
import * as ServerDetail from "./pages/ServerDetail";
import * as PermissionGroups from "./pages/PermissionGroups";
import * as PermissionGroupDetail from "./pages/PermissionGroupDetail";
import * as ChatLinks from "./pages/ChatLinks";

function NotFound() {
    return <div>404</div>;
}

export const routes: RouteObject[] = [
    {
        path: "/",
        Component: Layout,
        children: [
            { index: true, Component: Home },
            { path: "guilds", Component: Guilds.Component, loader: Guilds.loader, ErrorBoundary: Guilds.ErrorBoundary },
            { path: "modules", Component: GlobalModules.Component, loader: GlobalModules.loader, ErrorBoundary: GlobalModules.ErrorBoundary },
            {
                id: "guild",
                path: "guild/:guildId",
                Component: GuildLayout.Component,
                loader: GuildLayout.loader,
                ErrorBoundary: GuildLayout.ErrorBoundary,
                children: [
                    { path: "modules", Component: Modules.Component, loader: Modules.loader, ErrorBoundary: Modules.ErrorBoundary },
                    { path: "teams", Component: Teams.Component, loader: Teams.loader, ErrorBoundary: Teams.ErrorBoundary },
                    { path: "teams/:teamId", Component: TeamDetail.Component, loader: TeamDetail.loader, ErrorBoundary: TeamDetail.ErrorBoundary },
                    { path: "teams/:teamId/modules", Component: TeamModules.Component, loader: TeamModules.loader, ErrorBoundary: TeamModules.ErrorBoundary },
                    { path: "teams/:teamId/servers/:serverId", Component: ServerDetail.Component, loader: ServerDetail.loader, ErrorBoundary: ServerDetail.ErrorBoundary },
                    { path: "permissions", Component: PermissionGroups.Component, loader: PermissionGroups.loader, ErrorBoundary: PermissionGroups.ErrorBoundary },
                    { path: "permissions/:groupId", Component: PermissionGroupDetail.Component, loader: PermissionGroupDetail.loader, ErrorBoundary: PermissionGroupDetail.ErrorBoundary },
                    { path: "chat-links", Component: ChatLinks.Component, loader: ChatLinks.loader, ErrorBoundary: ChatLinks.ErrorBoundary },
                ],
            },
            { path: "*", Component: NotFound },
        ],
    },
];
