import { GatewayIntentBits } from "discord.js";
import mongoose from "mongoose";

import { DiscordBot } from "./classes/DiscordBot";
import { FmcListener } from "./classes/FmcListener";
import downloadItemList from "./downloadItemList";
import { WebServer } from "./classes/WebServer";
import websiteBuilding from "./websiteBuilding";
import "./modules/index"; // registers all modules into the registry
import { connectAll } from "./rustplus/connections";

await downloadItemList();
await mongoose.connect(Bun.env.MONGODB_URI);

await connectAll();

const client = new DiscordBot({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.init();
FmcListener.ListenToAll();
await websiteBuilding();
new WebServer().listen(Bun.env.PORT);
