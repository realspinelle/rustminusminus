import staticPlugin from "@elysiajs/static";
import Elysia from "elysia";
import { sessionPlugin } from "./routes/session";
import { authRoutes } from "./routes/authRoutes";
import { modulesRoutes } from "./routes/modulesRoutes";
import { guildsRoutes } from "./routes/guildsRoutes";
import { teamsRoutes } from "./routes/teamsRoutes";
import { permissionGroupsRoutes } from "./routes/permissionGroupsRoutes";
import { chatLinksRoutes } from "./routes/chatLinksRoutes";
import { renderPage } from "../server/render";

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
            .use(sessionPlugin)
            .use(authRoutes)
            .get("*", async ({ redirect, loggedIn, cookieToken, request }) => {
                if (!loggedIn) return redirect("/login");
                return await renderPage(request, cookieToken as string | undefined);
            })
            .group("api", e =>
                e
                    .get("healthcheck", () => {
                        return { status: "ok" }
                    })
                    .use(modulesRoutes)
                    .use(guildsRoutes)
                    .use(teamsRoutes)
                    .use(permissionGroupsRoutes)
                    .use(chatLinksRoutes)
            );
    }
}
