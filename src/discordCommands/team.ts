import { SlashCommandBuilder } from "discord.js";
import type { CommandType } from "../types/DiscordCommandType";
import { GuildModel } from "../models/Guild";
import { UserModel } from "../models/User";

export default {
    //TODO check permissions
    command: async (interaction) => {
        if (!interaction.guild) return;
        const subcommand = interaction.options.getSubcommand();
        if (subcommand == "create") {
            let name = interaction.options.getString("name", true);
            let guild = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guild) return await interaction.reply({ content: "Cant find your guild in database !", flags: ["Ephemeral"] });
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let result = await guild.createTeam(name);
            if (!result) {
                await interaction.editReply({ content: "An error while creating the team ! Check that the bot has administrator permission" });
            } else {
                await interaction.editReply({ content: "Team created !" });
            }
        }
        if (subcommand == "delete") {
            let name = interaction.options.getString("name", true);
            let guild = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guild) return await interaction.reply({ content: "Cant find your guild in database !", flags: ["Ephemeral"] });
            let team = await guild.findTeamByName(name);
            if (!team) return await interaction.reply({ content: "Cant find the team", flags: ["Ephemeral"] });
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let result = await guild.deleteTeam(name);
            if (!result) {
                await interaction.editReply({ content: "An error while deleting the team ! Check the name and that the bot has administrator permission" });
            } else {
                await interaction.editReply({ content: "Team deleted !" });
            }
        }
        if (subcommand == "reset") {
            let name = interaction.options.getString("name", true);
            let guild = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guild) return await interaction.reply({ content: "Cant find your guild in database !", flags: ["Ephemeral"] });
            let team = await guild.findTeamByName(name);
            if (!team) return await interaction.reply({ content: "Cant find the team", flags: ["Ephemeral"] });
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let result = await guild.deleteTeamChannels(name);
            if (!result) {
                return await interaction.editReply({ content: "An error while deleting the team ! Check the name and that the bot has administrator permission" });
            }
            let result2 = await guild.setupTeamChannels(name);
            if (!result2) {
                await interaction.editReply({ content: "An error while creating the team ! Check that the bot has administrator permission" });
            } else {
                let team = await guild.findTeamByName(name);
                if (!team) return await interaction.editReply({ content: "weird shit ! cant find team after setupTeamChannels" });
                team.discord.category.id = result2.categoryChannelId;
                team.discord.alarms.id = result2.alarmsChannelId;
                team.discord.alarms.messages = [];
                team.discord.information.id = result2.informationChannelId;
                team.discord.information.messages = [];
                team.discord.playerActivity.id = result2.playerActivityChannelId;
                team.discord.servers.id = result2.serversChannelId;
                team.discord.servers.messages = [];
                team.discord.storageMonitors.id = result2.storageMonitorsChannelId;
                team.discord.storageMonitors.messages = [];
                team.discord.switches.id = result2.switchesChannelId;
                team.discord.switches.messages = [];
                team.discord.teamChat.id = result2.teamchatChannelId;
                team.save();
                await interaction.editReply({ content: "Team channels reseted !" });
            }
        }
        if (subcommand == "adduser") {
            let name = interaction.options.getString("name", true);
            let user = interaction.options.getUser("user", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let guildDb = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guildDb) return await interaction.editReply({ content: "Cant find your guild in database !" });
            let teamDb = await guildDb.findTeamByName(name);
            if (!teamDb) return await interaction.editReply({ content: "Cant find the team" });
            let result = await teamDb.addMember(user.id);
            if (!result.ok) return await interaction.editReply({ content: result.error });
            await interaction.editReply({ content: "Done." });
        }
        if (subcommand == "removeuser") {
            let name = interaction.options.getString("name", true);
            let user = interaction.options.getUser("user", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            let guildDb = await GuildModel.findOne({ guildId: interaction.guild.id });
            if (!guildDb) return await interaction.editReply({ content: "Cant find your guild in database !" });
            let teamDb = await guildDb.findTeamByName(name);
            if (!teamDb) return await interaction.editReply({ content: "Cant find the team" });
            let userDb = await UserModel.findOne({ userId: user.id });
            if (!userDb) return await interaction.editReply({ content: "This user didnt link his account" });
            if (!teamDb.users.includes(userDb._id)) return await interaction.editReply({ content: "This user is not in this team" });
            if (teamDb.activeCredentialUserId == userDb._id) return await interaction.editReply({ content: "Change the active credential before removing this user from the team" });
            let member = guildDb.getDiscordGuild()?.members.cache.get(user.id);
            if (!member) return await interaction.editReply({ content: "Cant find that user in the server" });
            if (member.roles.cache.has(teamDb.discord.roleId)) {
                let botMember = guildDb.getDiscordGuild()?.members.cache.get(user.id);
                if (!botMember) return await interaction.editReply({ content: "Cant find the bot in the server" });
                if (!botMember.permissions.has('Administrator')) return await interaction.editReply({ content: "This bot doesnt have administator permissions" });
                if (member.roles.highest.position <= member.roles.highest.position) return await interaction.editReply({ content: "Make the bot role the highest on the server" });
                await member.roles.remove(teamDb.discord.roleId);
            }
            teamDb.users = teamDb.users.filter(e => e != e._id);
            await teamDb.save();
            await interaction.editReply({ content: "Done." });
        }
    },
    slashCommand: new SlashCommandBuilder()
        .addSubcommand(subcommand =>
            subcommand
                .setName("reset")
                .setDescription("Will reset the channels of the team if you messed up")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Will delete the team entirely (no rollback)")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Will create a team with the following name")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("adduser")
                .setDescription("Will add a user to team")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption
                        .setName("user")
                        .setDescription("User to add to team")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("removeuser")
                .setDescription("Will remove a user to team")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("name")
                        .setDescription("Name of the team")
                        .setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption
                        .setName("user")
                        .setDescription("User to remove from team")
                        .setRequired(true)
                )
        )
} as CommandType