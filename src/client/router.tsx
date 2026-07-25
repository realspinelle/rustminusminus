import type { RouteObject } from "react-router-dom";
import Layout from "./layout/Layout";
import Home from "./pages/Home";

function NotFound() {
    return <div>404</div>;
}

export const routes: RouteObject[] = [
    {
        path: "/",
        Component: Layout,
        children: [
            { index: true, Component: Home },
            { path: "guilds", lazy: () => import("./pages/Guilds") },
            { path: "guild/:guildId/modules", lazy: () => import("./pages/Modules") },
            { path: "guild/:guildId/teams", lazy: () => import("./pages/Teams") },
            { path: "guild/:guildId/teams/:teamId", lazy: () => import("./pages/TeamDetail") },
            { path: "guild/:guildId/teams/:teamId/servers/:serverId", lazy: () => import("./pages/ServerDetail") },
            { path: "guild/:guildId/permissions", lazy: () => import("./pages/PermissionGroups") },
            { path: "guild/:guildId/permissions/:groupId", lazy: () => import("./pages/PermissionGroupDetail") },
            { path: "*", Component: NotFound },
        ],
    },
];
