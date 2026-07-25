import { Document, model, Schema, Types } from "mongoose";
import { DiscordBot } from "../classes/DiscordBot";
import { getRandomHexColor } from "../utils";

const PermissionGroupSchema = new Schema(
    {
        guildId: { type: String, required: true },
        name: { type: String, required: true },
        permissions: [{ type: String, required: true }],
        // every group owns a Discord role - holding the role IS group membership, exactly like
        // TeamModel's discord.roleId, so there's no separate member list to keep in sync.
        roleId: { type: String, required: true },
    },
    { timestamps: true },
);

PermissionGroupSchema.index({ guildId: 1, name: 1 }, { unique: true });

export class PermissionGroupClass extends Document<Types.ObjectId> {
    guildId!: string;
    name!: string;
    permissions!: string[];
    roleId!: string;
    createdAt!: Date;
    updatedAt!: Date;

    getDiscordGuild() {
        return DiscordBot.Instance.guilds.cache.get(this.guildId);
    }

    async addMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const discordGuild = this.getDiscordGuild();
        if (!discordGuild) return { ok: false, error: "Cant find the Discord server" };
        const member = discordGuild.members.cache.get(discordUserId)
            ?? await discordGuild.members.fetch(discordUserId).catch(() => null);
        if (!member) return { ok: false, error: "Cant find that user in the server" };
        if (member.roles.cache.has(this.roleId)) return { ok: true };
        const botMember = discordGuild.members.me;
        if (!botMember) return { ok: false, error: "Cant find the bot in the server" };
        if (!botMember.permissions.has("ManageRoles")) return { ok: false, error: "This bot doesnt have Manage Roles permission" };
        if (botMember.roles.highest.position <= member.roles.highest.position) return { ok: false, error: "Make the bot role the highest on the server or manually assign the role" };
        await member.roles.add(this.roleId);
        return { ok: true };
    }

    async removeMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const discordGuild = this.getDiscordGuild();
        if (!discordGuild) return { ok: false, error: "Cant find the Discord server" };
        const member = discordGuild.members.cache.get(discordUserId)
            ?? await discordGuild.members.fetch(discordUserId).catch(() => null);
        if (!member) return { ok: false, error: "Cant find that user in the server" };
        if (member.roles.cache.has(this.roleId)) await member.roles.remove(this.roleId);
        return { ok: true };
    }

    /** Current members, read straight off the linked Discord role - no separate list to fetch or desync. */
    getMembers(): { userId: string; displayName: string }[] {
        const role = this.getDiscordGuild()?.roles.cache.get(this.roleId);
        if (!role) return [];
        return role.members.map(m => ({ userId: m.id, displayName: m.displayName }));
    }

    async deleteWithRole() {
        await this.getDiscordGuild()?.roles.delete(this.roleId).catch(() => null);
        await this.deleteOne();
    }
}

PermissionGroupSchema.loadClass(PermissionGroupClass);

export const PermissionGroupModel = model<PermissionGroupClass>("PermissionGroup", PermissionGroupSchema);

/** Creates the group's Discord role first, then the DB record - mirrors GuildClass.createTeam. */
export async function createPermissionGroup(guildId: string, name: string): Promise<PermissionGroupClass | null> {
    const discordGuild = DiscordBot.Instance.guilds.cache.get(guildId);
    if (!discordGuild) return null;
    const role = await discordGuild.roles.create({
        name,
        colors: { primaryColor: getRandomHexColor() as `#${string}` },
    }).catch(() => null);
    if (!role) return null;
    return await PermissionGroupModel.create({ guildId, name, permissions: [], roleId: role.id });
}
