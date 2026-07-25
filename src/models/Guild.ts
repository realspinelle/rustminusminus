import { Document, model, Schema, Types } from "mongoose";
import { TeamModel } from "./Team";
import { DiscordBot } from "../classes/DiscordBot";
import { getRandomHexColor } from "../utils";
import { disconnectTeam } from "../rustplus/connections";
import { registry } from "../modules/ModuleRegistry";
import { ChannelType, PermissionFlagsBits, Role, type ColorResolvable } from "discord.js";
const GuildSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    teams: [{ type: Schema.Types.ObjectId, ref: "Team" }],
    modules: [{
        moduleId: { type: String, required: true },
        enabled: { type: Boolean, required: true },
        settings: { type: Schema.Types.Mixed, default: {} }
    }]
}, { timestamps: true });

export class GuildClass extends Document<Types.ObjectId> {
    guildId!: string;
    teams!: Types.ObjectId[];
    modules!: { moduleId: string; enabled: boolean; settings: Record<string, unknown> }[];
    createdAt!: Date;
    updatedAt!: Date;

    isModuleEnabled(moduleId: string): boolean {
        return this.modules?.find(m => m.moduleId === moduleId)?.enabled
            ?? registry.get(moduleId)?.defaultEnabled
            ?? false;
    }

    async createTeam(name: string) {
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        let role = await guild.roles.create({
            name,
            colors: {
                primaryColor: getRandomHexColor() as `#${string}`
            }
        });
        if (!role) return false;
        let setup = await this.setupTeamChannels(name, role);
        if (!setup) return false;
        let { categoryChannelId, roleId, alarmsChannelId, informationChannelId, playerActivityChannelId, serversChannelId, storageMonitorsChannelId, switchesChannelId, teamchatChannelId } = setup;
        let team = await TeamModel.create({
            name,
            discord: {
                category: {
                    id: categoryChannelId
                },
                alarms: {
                    id: alarmsChannelId,
                    messages: []
                },
                information: {
                    id: informationChannelId,
                    messages: []
                },
                playerActivity: {
                    id: playerActivityChannelId
                },
                servers: {
                    id: serversChannelId,
                    messages: []
                },
                storageMonitors: {
                    id: storageMonitorsChannelId,
                    messages: []
                },
                switches: {
                    id: switchesChannelId,
                    messages: []
                },
                teamChat: {
                    id: teamchatChannelId
                },
                roleId
            }
        });
        this.teams.push(team._id);
        this.save();
        return true;
    }

    async setupTeamChannels(name: string, role?: Role) {
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        if (!role) {
            let team = await this.findTeamByName(name);
            if (!team) return false;
            role = guild.roles.cache.get(team.discord.roleId);
        }
        let categoryChannel = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [
                        PermissionFlagsBits.ViewChannel
                    ]
                },
                {
                    id: role!.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel
                    ]
                }
            ]
        });
        let informationChannel = await guild.channels.create({
            name: "information",
            parent: categoryChannel.id
        });
        let serversChannel = await guild.channels.create({
            name: "servers",
            parent: categoryChannel.id
        });
        let teamchatChannel = await guild.channels.create({
            name: "teamchat",
            parent: categoryChannel.id
        });
        let switchesChannel = await guild.channels.create({
            name: "switches",
            parent: categoryChannel.id
        });
        let alarmsChannel = await guild.channels.create({
            name: "alarms",
            parent: categoryChannel.id
        });
        let storageMonitorsChannel = await guild.channels.create({
            name: "storageMonitors",
            parent: categoryChannel.id
        });
        let playerActivityChannel = await guild.channels.create({
            name: "playerActivity",
            parent: categoryChannel.id
        });
        if (!categoryChannel) return false;
        return {
            roleId: role!.id,
            categoryChannelId: categoryChannel.id,
            informationChannelId: informationChannel.id,
            serversChannelId: serversChannel.id,
            teamchatChannelId: teamchatChannel.id,
            switchesChannelId: switchesChannel.id,
            alarmsChannelId: alarmsChannel.id,
            storageMonitorsChannelId: storageMonitorsChannel.id,
            playerActivityChannelId: playerActivityChannel.id
        };
    }

    async deleteTeamChannels(name: string) {
        let team = await this.findTeamByName(name);
        if (!team) return false;
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        const category = guild.channels.cache.get(team.discord.category.id);
        if (!category || category.type !== 4) {
            return false;
        }
        const channelsToDelete = guild.channels.cache.filter(
            ch => ch.parentId === team.discord.category.id
        );
        for (const channel of channelsToDelete.values()) {
            try {
                await channel.delete();
            } catch (err) {
                console.error(`Failed to delete ${channel.name}:${channel.id} :`, err);
            }
        }
        await category.delete();
        return true;
    }
    async deleteTeam(name: string) {
        let team = await this.findTeamByName(name);
        if (!team) return false;
        disconnectTeam(team._id);
        let guild = this.getDiscordGuild();
        if (!guild) return false;
        const category = guild.channels.cache.get(team.discord.category.id);
        if (!category || category.type !== 4) {
            return false;
        }
        const channelsToDelete = guild.channels.cache.filter(
            ch => ch.parentId === team.discord.category.id
        );
        for (const channel of channelsToDelete.values()) {
            try {
                await channel.delete();
            } catch (err) {
                console.error(`Failed to delete ${channel.name}:${channel.id} :`, err);
            }
        }
        await category.delete();
        await guild.roles.delete(team.discord.roleId);
        this.teams = (await this.getTeams()).filter(e => e.name != name).map(e => e._id);
        await this.save();
        await TeamModel.deleteOne({ _id: team._id });
        return true;
    }

    getDiscordGuild() {
        let bot = DiscordBot.Instance;
        return bot.guilds.cache.get(this.guildId);
    }

    async getTeams() {
        return await TeamModel.find({
            _id: { $in: this.teams }
        });
    }

    async findTeamByName(name: string) {
        return (await this.getTeams()).find(e => e.name == name) || null;
    }
}

GuildSchema.loadClass(GuildClass);

export const GuildModel = model<GuildClass>("Guild", GuildSchema);