import { Document, model, Schema, Types } from "mongoose";
import { UserModel } from "./User";
import { ServerModel } from "./Server";
import { connectTeam, disconnectTeam, getActiveRustplus } from "../rustplus/connections";
import { GuildModel } from "./Guild";
import { registry } from "../modules/ModuleRegistry";
import { grantRole } from "../utils/discordRoles";

const ServerSchema = {
    serverId: { type: String, required: true },
    pairedItems: {
        smartSwitch: [{
            id: { type: String, required: true }
        }],
        smartAlarm: [{
            id: { type: String, required: true },
            lastTriggered: { type: Date }
        }],
        storageMonitor: [{
            id: { type: String, required: true }
        }]
    }
};

const TeamSchema = new Schema({
    name: { type: String, required: true },
    discord: {
        category: {
            id: { type: String, required: true }
        },
        playerActivity: {
            id: { type: String, required: true }
        },
        teamChat: {
            id: { type: String, required: true }
        },
        information: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true }
            }]
        },
        servers: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true }
            }]
        },
        switches: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true }
            }]
        },
        alarms: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true }
            }]
        },
        storageMonitors: {
            id: { type: String, required: true },
            messages: [{
                id: { type: String, required: true }
            }]
        },
        roleId: { type: String, required: true }
    },
    users: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    servers: [ServerSchema],
    activeServerId: { type: String },
    activeCredentialUserId: { type: Schema.Types.ObjectId },
    modules: [{
        moduleId: { type: String, required: true },
        enabled: { type: Boolean, required: true },
        settings: { type: Schema.Types.Mixed, default: {} }
    }]
}, { timestamps: true });

export class TeamClass extends Document<Types.ObjectId> {
    name!: string;
    discord!: {
        category: { id: string };
        playerActivity: { id: string };
        teamChat: { id: string };
        information: { id: string; messages: { id: string }[] };
        servers: { id: string; messages: { id: string }[] };
        switches: { id: string; messages: { id: string }[] };
        alarms: { id: string; messages: { id: string }[] };
        storageMonitors: { id: string; messages: { id: string }[] };
        roleId: string;
    };
    users!: Types.ObjectId[];
    servers!: {
        serverId: string;
        pairedItems: {
            smartSwitch: { id: string }[];
            smartAlarm: { id: string; lastTriggered?: Date }[];
            storageMonitor: { id: string }[];
        };
    }[];
    activeServerId?: string;
    activeCredentialUserId?: Types.ObjectId;
    modules!: { moduleId: string; enabled: boolean; settings: Record<string, unknown> }[];
    createdAt!: Date;
    updatedAt!: Date;

    async getUsers() {
        return await UserModel.find({
            _id: { $in: this.users }
        });
    }

    async getActiveCredentialUser() {
        if (!this.activeCredentialUserId) return null;
        return await UserModel.findById(this.activeCredentialUserId);
    }

    async getActiveServerCredential() {
        let user = await this.getActiveCredentialUser();
        if (!user) return null;
        return user.credentials.servers.find(e => e.serverId == this.activeServerId);
    }

    async getActiveServer() {
        return await ServerModel.findOne({ serverId: this.activeServerId });
    }

    getActiveRustPlus() {
        return getActiveRustplus(this._id);
    }

    getActiveServerPaired() {
        return this.servers.find(e => e.serverId == this.activeServerId)?.pairedItems;
    }

    isModuleEnabled(moduleId: string): boolean {
        return this.modules?.find(m => m.moduleId === moduleId)?.enabled
            ?? registry.get(moduleId)?.defaultEnabled
            ?? false;
    }

    async changeActiveServer(serverId: string) {
        let user = await this.getActiveCredentialUser();
        if (!user) return null;
        let creds = user.credentials.servers.find(e => e.serverId == serverId);
        if (!creds) {
            return false;
        }
        disconnectTeam(this._id);
        this.activeServerId = serverId;
        await this.save();
        await this.connectRustPlus();
    }

    async changeActiveCredentialUser(userId: Types.ObjectId) {
        let user = await UserModel.findById(userId);
        if (!user) return null;
        if (this.activeServerId) {
            let creds = user.credentials.servers.find(e => e.serverId == this.activeServerId);
            if (!creds) {
                return false;
            }
        }
        this.activeCredentialUserId = userId;
        await this.save();
    }

    async connectRustPlus() {
        let user = await this.getActiveCredentialUser();
        if (!user) return console.log("cant find user");
        let cred = await this.getActiveServerCredential();
        if (!cred) return console.log("cant find cred");
        let server = await this.getActiveServer();
        if (!server) return console.log("cant find server");
        await connectTeam(this, server.ip, server.port, user.credentials.steam_id, cred.playerToken);
    }
    async getGuild() {
        return await GuildModel.findOne({ teams: this._id });
    }

    async addMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const userDb = await UserModel.findOne({ userId: discordUserId });
        if (!userDb) return { ok: false, error: "This user hasn't linked their account" };
        if (this.users.some(id => id.equals(userDb._id))) return { ok: false, error: "This user is already in this team" };
        const discordGuild = (await this.getGuild())?.getDiscordGuild();
        if (!discordGuild) return { ok: false, error: "Cant find the Discord server" };
        const result = await grantRole(discordGuild, this.discord.roleId, discordUserId, "Administrator", "This bot doesnt have administrator permissions");
        if (!result.ok) return result;
        this.users.push(userDb._id);
        await this.save();
        return { ok: true };
    }
    /** Looks up one of this team's provisioned Discord channels by its `discord` sub-key. */
    async getChannel(key: Exclude<keyof TeamClass["discord"], "roleId">) {
        let guild = (await this.getGuild())?.getDiscordGuild();
        let channel = guild?.channels.cache.get(this.discord[key].id);
        if (channel?.isTextBased()) return null;
        return channel;
    }
    async getDiscordRole() {
        let guild = (await this.getGuild())?.getDiscordGuild();
        return guild?.roles.cache.get(this.discord.roleId);;
    }
}

TeamSchema.loadClass(TeamClass);

export const TeamModel = model<TeamClass>("Team", TeamSchema);