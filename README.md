# rustminusminus

A Discord bot + web dashboard for managing [Rust+](https://rust.facepunch.com/companion) enabled
Rust servers, heavily inspired by
[rustplusplus](https://github.com/alexemanuelol/rustplusplus) by alexemanuelol — but built around
a different core idea: **every feature is a toggleable module**, controllable per Discord server
(guild) or per in-game team, live, without a bot restart.

Uses [rustminus](https://github.com/realspinelle/rustminus) (a from-scratch TypeScript rewrite of `rustplus.js`) for the actual Rust+ WebSocket/FCM protocol.

## What makes this different from a straight rustplusplus port

rustplusplus registers all ~24 of its commands unconditionally and gates them with a handful of
global boolean flags (`generalSettings.inGameCommandsEnabled`, etc.) — there's no way to turn one
feature on for one team and off for another, and no web UI at all.

Here, every feature (in-game chat commands, Discord slash commands, and whatever the web UI
exposes) is bundled as a **module**:

- Modules declare their own in-game commands, Discord commands, and settings schema.
- A module can be scoped `team`, `guild`, or `global`, and toggled at that granularity from the
  web dashboard.
- Toggling is instant: Discord commands are registered **per-guild** (not globally) and re-synced
  the moment a module's state changes; in-game commands are gated by an in-memory lookup checked
  on every incoming chat message — no bot restart, ever.
- The first real module built on this system is **cross-team chat**: link two or more separate
  in-game teams together (`/chatlink create|add|remove|list`) so their team chats relay to each
  other in real time.

See [`src/modules/`](src/modules) for the module contract (`types.ts`), the registry/dispatcher
(`ModuleRegistry.ts`), and the cross-team-chat module as a worked example. Planned modules and
other deferred ideas (per-player permission groups, craft/raid cost config, porting the rest of
rustplusplus's commands) are tracked in [`TODOLATER.md`](TODOLATER.md).

## Features

- Multi-guild, multi-team: one Discord server can manage several independent in-game teams, each
  with its own Rust+ connection, paired smart devices, and Discord category/channels/role.
- Auto-provisions per-team Discord channels (team chat, alarms, switches, storage monitors,
  servers, player activity, information) and a dedicated role.
- FCM listener auto-pairs smart switches/alarms/storage monitors and registers servers as
  pairing notifications arrive from the Rust+ companion app.
- Web dashboard (React + Discord OAuth login) for toggling modules per guild/team.
- Cross-team chat relay module, with duplicate/echo-loop protection.

## Tech stack

Bun (runtime + package manager + bundler) · TypeScript · Discord.js v14 · MongoDB / Mongoose ·
Elysia (web server) · React 19 + react-router-dom v7 (web dashboard) ·
[rustminus](https://www.npmjs.com/package/rustminus) (Rust+ protocol client).

## Prerequisites

- [Bun](https://bun.sh)
- A MongoDB instance (local or hosted, e.g. MongoDB Atlas)
- A [Discord application](https://discord.com/developers/applications) with a bot user (you'll
  need its token, and the OAuth2 client secret for the web dashboard's login flow)

## Setup

1. Install dependencies:
   ```sh
   bun install
   ```
2. Copy `.env` and fill in your own values:
   ```env
   TOKEN=your-discord-bot-token
   OAUTH_SECRET=your-discord-oauth2-client-secret
   PORT=3000
   HOST=localhost
   PROTOCOL=http
   MONGODB_URI=mongodb://127.0.0.1/rustminusminus
   NODE_ENV=production
   ```
   For a hosted MongoDB (e.g. Atlas) or one with auth enabled, `MONGODB_URI` just needs to be a
   full connection string with credentials, e.g.
   `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/rustminusminus`.
3. In the Discord Developer Portal, add `http://<HOST>:<PORT>/callback` as an OAuth2 redirect URI
   (matching `PROTOCOL`/`HOST`/`PORT` above), with the `identify` and `guilds` scopes.
4. Run it:
   ```sh<>
   bun run src/index.ts
   ```
   This connects to MongoDB, logs the Discord bot in, reconnects any previously-configured
   Rust+ teams, builds and serves the web dashboard, and starts the web server on `PORT`.

## Discord commands

- `/credentials add|delete` — link your Rust+ FCM/Steam credentials to your Discord account (used
  to receive pairing notifications and control servers on your behalf).
- `/team create|delete|reset|adduser|removeuser` — create/manage an in-game team and its Discord
  channels/role.
- `/chatlink create|add|remove|list` — manage cross-team chat links (only registered for a guild
  once the Cross-Team Chat module is enabled there).

Additional module-owned commands appear automatically as their modules get enabled per guild.

## Web dashboard

Visit the bot's web address (`PROTOCOL://HOST:PORT`) and log in with Discord. `/guilds` lists the
servers you can manage (requires `MANAGE_GUILD` permission there); from a guild's `/modules` page
you can toggle each module on/off per team (or per guild, for guild/global-scoped modules).

## Project layout

```
src/
  classes/          DiscordBot, WebServer, FmcListener (core services)
  rustplus/          RustPlus connection lifecycle (connect/disconnect/lookup by team)
  modules/           Module system: types, registry/dispatcher, and each module's implementation
  models/            Mongoose models: Guild, Team, User, Server, OAuth, ChatLink
  discordCommands/   Core (always-registered) Discord slash commands
  client/            React web dashboard (pages, layout, routing)
```

## License

MIT
