import { Client, Events, Guild, REST, Routes, type ClientOptions } from "discord.js";
import fs from "fs/promises";
import type { CommandType } from "../types/DiscordCommandType";
import { GuildModel } from "../models/Guild";
import { registry } from "../modules/ModuleRegistry";

export class DiscordBot extends Client {
    private CLIENT_ID: undefined | string;
    private coreCommands: CommandType[] = [];
    public static Instance: DiscordBot;
    constructor(props: ClientOptions) {
        super(props);
        DiscordBot.Instance = this;
    }
    init() {
        this.eventRegister();
        this.login(Bun.env.TOKEN);
    }
    eventRegister() {
        this.on(Events.ClientReady, async (client) => {
            this.CLIENT_ID = client.user.id;
            console.log("Connected to discord as " + client.user.tag);
            await this.clearGlobalCommands();
            await this.slashCommandRegister();
            await this.guildsInit();
        });
        this.on(Events.GuildCreate, async (guild) => {
            await this.guildInit(guild);
        });
        this.on(Events.GuildDelete, (guild) => {
            this.guildRemove(guild);
        });
        this.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const coreCommand = this.coreCommands.find(e => e.name == interaction.commandName);
            if (coreCommand) {
                await coreCommand.command(interaction);
                return;
            }

            if (!interaction.guildId) return;
            const owningModule = registry.moduleDiscordCommandOwners().get(interaction.commandName);
            if (!owningModule) return;
            // race-condition safety net: the command normally isn't even registered when disabled
            if (!registry.isEnabledForGuild(owningModule.id, interaction.guildId)) {
                await interaction.reply({ content: "This module is disabled for this server.", flags: ["Ephemeral"] });
                return;
            }
            const command = owningModule.discordCommands?.find(c => c.name === interaction.commandName);
            await command?.command(interaction);
        });
    }
    async slashCommandRegister() {
        let folder = await fs.readdir("./src/discordCommands");
        for (const file of folder) {
            let command = (await import("../discordCommands/" + file)).default as CommandType;
            let name = file.split(".")[0];
            if (!name) return;
            command.name = name;
            command.slashCommand.setName(name);
            if (!command.slashCommand.description) {
                command.slashCommand.setDescription("No description yet")
            }
            this.coreCommands.push(command);
            console.log("Discord command '" + command.name + "' loaded !")
        }
    }
    /** PUTs the full enabled command set (core + enabled modules) for one guild - Discord applies
     *  guild-scoped command changes near-instantly, which is what makes toggling a module live. */
    async registerGuildCommands(guildId: string) {
        if (!this.CLIENT_ID) return;
        const rest = new REST({ version: '10' }).setToken(Bun.env.TOKEN);
        const enabledModuleCommandNames = registry.discordCommandNamesForGuild(guildId);
        const enabledModuleCommands = registry.allDiscordCommands().filter(c => enabledModuleCommandNames.has(c.name));
        const body = [...this.coreCommands, ...enabledModuleCommands].map(c => c.slashCommand.toJSON());
        try {
            await rest.put(Routes.applicationGuildCommands(this.CLIENT_ID, guildId), { body });
            console.log(`Successfully synced application (/) commands for guild ${guildId}.`);
        } catch (error) {
            console.error(error);
        }
    }
    /** Wipes any GLOBALLY-registered commands from earlier versions of this bot (which used
     *  Routes.applicationCommands). Commands are now guild-scoped only (registerGuildCommands),
     *  but Discord doesn't clear old global registrations on its own just because we stopped
     *  calling that endpoint - without this, old global commands stick around forever and show
     *  up duplicated alongside the new guild-scoped ones. Safe/idempotent to run on every start. */
    async clearGlobalCommands() {
        if (!this.CLIENT_ID) return;
        const rest = new REST({ version: '10' }).setToken(Bun.env.TOKEN);
        try {
            await rest.put(Routes.applicationCommands(this.CLIENT_ID), { body: [] });
        } catch (error) {
            console.error(error);
        }
    }
    async guildsInit() {
        let guilds = this.guilds.cache;
        for (let keyvalue of guilds) {
            let [id, guild] = keyvalue;
            await this.guildInit(guild)
        }
        let guildsToDelete = (await GuildModel.find()).map(e => e.guildId).filter(e => !guilds.has(e));
        for (const guild of guildsToDelete) {
            if (guild) {
                this.guildRemoveId(guild);
            }
        }
    }
    async guildInit(guild: Guild) {
        let data = await this.getGuildData(guild);
        if (!data) {
            data = await GuildModel.create({
                guildId: guild.id
            });
        }
        registry.primeGuild(data);
        await this.registerGuildCommands(guild.id);
    }
    async guildRemove(guild: Guild) {
        return this.guildRemoveId(guild.id);
    }
    async guildRemoveId(guild: string) {
        await GuildModel.deleteOne({ guildId: guild });
    }
    async getGuildData(guild: Guild) {
        return await GuildModel.findOne({ guildId: guild.id })
    }
}
