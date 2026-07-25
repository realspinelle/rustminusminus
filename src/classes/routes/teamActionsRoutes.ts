import Elysia from "elysia";
import { setRaidAlertRadius } from "../../server/dataAccess/raidAlerts";
import { sendTeamChatMessage } from "../../server/dataAccess/teamChat";
import { sessionPlugin } from "./session";

export const teamActionsRoutes = new Elysia({ name: "teamActionsRoutes" })
    .use(sessionPlugin)
    .patch("guilds/:guildId/teams/:teamId/raid-alert-radius", async ({ params, body, cookieToken, set }) => {
        const meters = Number((body as { meters?: number }).meters);
        if (!Number.isFinite(meters) || meters <= 0) { set.status = 400; return { error: "Radius must be a positive number" }; }
        const result = await setRaidAlertRadius(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            meters,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    })
    .post("guilds/:guildId/teams/:teamId/chat", async ({ params, body, cookieToken, set }) => {
        const message = (body as { message?: string }).message?.trim();
        if (!message) { set.status = 400; return { error: "Message is required" }; }
        const result = await sendTeamChatMessage(
            cookieToken as string | undefined,
            params.guildId as string,
            params.teamId as string,
            message,
        );
        if (!result.ok) { set.status = result.status; return { error: result.error }; }
        return { ok: true };
    });
