import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandType } from "../types/DiscordCommandType";
import { GuildModel } from "../models/Guild";
import { PermissionGroupModel, createPermissionGroup } from "../models/PermissionGroup";
import { PERMISSIONS, type PermissionId } from "../permissions/definitions";

const ENFORCED_PERMISSIONS = PERMISSIONS.filter(p => p.status === "enforced");

export default {
    command: async (interaction) => {
        if (!interaction.guild) return;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await interaction.reply({ content: "You need Manage Server permission to manage permission groups.", flags: ["Ephemeral"] });
        }
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Cant find your guild in database !", flags: ["Ephemeral"] });

        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        if (group === "group") {
            if (subcommand === "create") {
                const name = interaction.options.getString("name", true);
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const existing = await PermissionGroupModel.findOne({ guildId: guild.guildId, name });
                if (existing) return await interaction.editReply({ content: "A permission group with that name already exists" });
                const created = await createPermissionGroup(guild.guildId, name);
                if (!created) return await interaction.editReply({ content: "Failed to create the group's Discord role — check the bot has Manage Roles permission" });
                return await interaction.editReply({ content: `Permission group "${name}" created ! Give members its Discord role to grant access.` });
            }

            if (subcommand === "delete") {
                const name = interaction.options.getString("name", true);
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const permGroup = await PermissionGroupModel.findOne({ guildId: guild.guildId, name });
                if (!permGroup) return await interaction.editReply({ content: "Cant find that permission group" });
                await permGroup.deleteWithRole();
                return await interaction.editReply({ content: `Permission group "${name}" deleted !` });
            }

            if (subcommand === "list") {
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const groups = await PermissionGroupModel.find({ guildId: guild.guildId });
                if (groups.length === 0) return await interaction.editReply({ content: "No permission groups yet." });
                const lines = groups.map(g => `**${g.name}**: ${g.permissions.join(", ") || "(no permissions)"} — ${g.getMembers().length} member(s)`);
                return await interaction.editReply({ content: lines.join("\n") });
            }

            if (subcommand === "add-permission" || subcommand === "remove-permission") {
                const name = interaction.options.getString("name", true);
                const permission = interaction.options.getString("permission", true) as PermissionId;
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const permGroup = await PermissionGroupModel.findOne({ guildId: guild.guildId, name });
                if (!permGroup) return await interaction.editReply({ content: "Cant find that permission group" });
                if (subcommand === "add-permission") {
                    if (!permGroup.permissions.includes(permission)) permGroup.permissions.push(permission);
                } else {
                    permGroup.permissions = permGroup.permissions.filter(p => p !== permission);
                }
                await permGroup.save();
                return await interaction.editReply({ content: "Done." });
            }
        }

        if (subcommand === "assign" || subcommand === "unassign") {
            const name = interaction.options.getString("group", true);
            const user = interaction.options.getUser("user", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            const permGroup = await PermissionGroupModel.findOne({ guildId: guild.guildId, name });
            if (!permGroup) return await interaction.editReply({ content: "Cant find that permission group" });
            const result = subcommand === "assign" ? await permGroup.addMember(user.id) : await permGroup.removeMember(user.id);
            if (!result.ok) return await interaction.editReply({ content: result.error });
            return await interaction.editReply({ content: "Done." });
        }
    },
    slashCommand: new SlashCommandBuilder()
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName("group")
                .setDescription("Manage permission groups")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Create a new permission group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("delete")
                        .setDescription("Delete a permission group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("list")
                        .setDescription("List permission groups")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add-permission")
                        .setDescription("Add a permission to a group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                        .addStringOption(stringoption =>
                            stringoption
                                .setName("permission")
                                .setDescription("Permission to add")
                                .setRequired(true)
                                .addChoices(...ENFORCED_PERMISSIONS.map(p => ({ name: p.label, value: p.id })))
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove-permission")
                        .setDescription("Remove a permission from a group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                        .addStringOption(stringoption =>
                            stringoption
                                .setName("permission")
                                .setDescription("Permission to remove")
                                .setRequired(true)
                                .addChoices(...ENFORCED_PERMISSIONS.map(p => ({ name: p.label, value: p.id })))
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("assign")
                .setDescription("Assign a Discord user to a permission group")
                .addStringOption(stringoption =>
                    stringoption.setName("group").setDescription("Name of the permission group").setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption.setName("user").setDescription("Discord user to assign").setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("unassign")
                .setDescription("Unassign a Discord user from a permission group")
                .addStringOption(stringoption =>
                    stringoption.setName("group").setDescription("Name of the permission group").setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption.setName("user").setDescription("Discord user to unassign").setRequired(true)
                )
        )
} as CommandType
