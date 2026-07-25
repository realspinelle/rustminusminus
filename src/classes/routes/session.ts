import Elysia from "elysia";
import { OauthClass, OauthModel } from "../../models/OAuth";

/**
 * Derives `cookieToken` (assigning + persisting one if the request has none yet) and `loggedIn`
 * globally, so every route composed from this plugin sees them typed without a cast. Named +
 * exported as a single shared instance so Elysia's plugin deduplication (by name) runs this
 * derive logic once per request even though several route files `.use()` it independently.
 */
export const sessionPlugin = new Elysia({ name: "session" })
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
    });
