import axios from "axios";
import { Document, model, Schema, Types } from "mongoose";
import crypto from "crypto"
import type { DiscordPartialGuild, DiscordUser } from "../types/DiscordApi";
const OauthSchema = new Schema({
    cookieId: { type: String, required: true, unique: true },
    userId: { type: String },
    redirectTo: { type: String },
    expiration: { type: Date },
    accessToken: { type: String }
}, { timestamps: true });

// Discord's /users/@me and /users/@me/guilds endpoints are tightly rate-limited per access
// token, and both are called on nearly every request (guild/team admin checks, the loggedIn
// gate). Cache successful responses per cookie so a burst of page/API calls doesn't trip
// Discord's rate limit and surface as spurious 401s. Failures are never cached, so a transient
// error just retries on the next call instead of being "stuck" for the TTL. In-flight requests
// are also deduped (the pending promise itself is cached) - without this, several requests
// landing before the first one resolves would each fire their own live Discord call and could
// still trip the rate limit even with a cache in place.
const DISCORD_CACHE_TTL_MS = 5 * 60_000;

export class OauthClass extends Document<Types.ObjectId> {
    cookieId!: string;
    userId?: string;
    redirectTo?: string;
    expiration?: Date;
    accessToken?: string;

    private static userCache = new Map<string, { data: DiscordUser; expiresAt: number }>();
    private static userInFlight = new Map<string, Promise<DiscordUser | null>>();
    private static guildsCache = new Map<string, { data: DiscordPartialGuild[]; expiresAt: number }>();
    private static guildsInFlight = new Map<string, Promise<DiscordPartialGuild[] | null>>();

    async getUser(): Promise<DiscordUser | null> {
        const cached = OauthClass.userCache.get(this.cookieId);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        const inFlight = OauthClass.userInFlight.get(this.cookieId);
        if (inFlight) return inFlight;
        const request = (async () => {
            try {
                const userRes = await axios.get("https://discord.com/api/users/@me", {
                    headers: { Authorization: `Bearer ${this.accessToken}` },
                    validateStatus: () => true
                });
                if (userRes.status != 200) return null;
                OauthClass.userCache.set(this.cookieId, { data: userRes.data, expiresAt: Date.now() + DISCORD_CACHE_TTL_MS });
                return userRes.data;
            } finally {
                OauthClass.userInFlight.delete(this.cookieId);
            }
        })();
        OauthClass.userInFlight.set(this.cookieId, request);
        return request;
    }

    async getGuilds(): Promise<DiscordPartialGuild[] | null> {
        const cached = OauthClass.guildsCache.get(this.cookieId);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        const inFlight = OauthClass.guildsInFlight.get(this.cookieId);
        if (inFlight) return inFlight;
        const request = (async () => {
            try {
                const guilds = await axios.get("https://discord.com/api/users/@me/guilds", {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                    validateStatus: () => true
                });
                if (guilds.status != 200) return null;
                OauthClass.guildsCache.set(this.cookieId, { data: guilds.data, expiresAt: Date.now() + DISCORD_CACHE_TTL_MS });
                return guilds.data;
            } finally {
                OauthClass.guildsInFlight.delete(this.cookieId);
            }
        })();
        OauthClass.guildsInFlight.set(this.cookieId, request);
        return request;
    }

    static generateRandomString(length = 64) {
        return crypto.randomBytes(length).toString("hex").slice(0, length);
    }

    static async generateUniqueCookieId(length = 64): Promise<string> {
        const candidate = this.generateRandomString(length);
        const exists = await OauthModel.exists({ cookieId: candidate });
        if (exists) {
            return this.generateUniqueCookieId(length);
        }
        return candidate;
    }

}

OauthSchema.loadClass(OauthClass);

export const OauthModel = model<OauthClass>("Oauth", OauthSchema);