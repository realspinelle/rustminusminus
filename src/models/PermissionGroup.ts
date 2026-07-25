import { Document, model, Schema, Types } from "mongoose";
import { DiscordBot } from "../classes/DiscordBot";
import { getRandomHexColor } from "../utils";
import { grantRole, revokeRole } from "../utils/discordRoles";

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
        if (!discordGuild) return { ok: false, error: "Can't find the Discord server" };
        return grantRole(discordGuild, this.roleId, discordUserId, "ManageRoles", "This bot doesn't have Manage Roles permission");
    }

    async removeMember(discordUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
        const discordGuild = this.getDiscordGuild();
        if (!discordGuild) return { ok: false, error: "Can't find the Discord server" };
        return revokeRole(discordGuild, this.roleId, discordUserId);
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
