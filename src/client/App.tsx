import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import { Helmet, HelmetProvider } from "react-helmet-async";

const Home = lazy(() => import("./pages/Home"));
const Guilds = lazy(() => import("./pages/Guilds"));
const Modules = lazy(() => import("./pages/Modules"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamDetail = lazy(() => import("./pages/TeamDetail"));
const ServerDetail = lazy(() => import("./pages/ServerDetail"));
const PermissionGroups = lazy(() => import("./pages/PermissionGroups"));
const PermissionGroupDetail = lazy(() => import("./pages/PermissionGroupDetail"));

export default () => {
    return (
        <HelmetProvider>
            <Helmet>
                <title>RustMinusMinus</title>
            </Helmet>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<Home />} />
                        <Route path="guilds" element={<Guilds />} />
                        <Route path="guild/:guildId/modules" element={<Modules />} />
                        <Route path="guild/:guildId/teams" element={<Teams />} />
                        <Route path="guild/:guildId/teams/:teamId" element={<TeamDetail />} />
                        <Route path="guild/:guildId/teams/:teamId/servers/:serverId" element={<ServerDetail />} />
                        <Route path="guild/:guildId/permissions" element={<PermissionGroups />} />
                        <Route path="guild/:guildId/permissions/:groupId" element={<PermissionGroupDetail />} />
                        <Route path="*" element={<div>404</div>} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </HelmetProvider>
    );
}