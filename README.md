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
- Modules built on this system so far: **cross-team chat** (`/chatlink create|add|remove|list`),
  **team tracker** (member join/leave/online/offline/death/respawn log + `/team-status`),
  **smart switches** (`/switch list|on|off|rename`, `!switch on/off <name>`), **smart alarms**
  (`/alarm list|rename`, Discord alerts on trigger), **storage monitors**
  (`/storagemonitor list|view|rename`), **chat relay** (two-way Discord ↔ in-game team chat),
  **server info panel** (live pop/time/wipe embed, `!pop`/`!time`/`!wipe`), **map events**
  (`/events`, cargo ship/patrol heli/chinook/crate alerts with grid location), **raid alerts**
  (`/raidalert radius`, pings the team when an explosion is detected near an online member), and
  **vending search** (`/market <item>`, `!market <item>`).

See [`src/modules/`](src/modules) for the module contract (`types.ts`), the registry/dispatcher
(`ModuleRegistry.ts`), and `cross-team-chat` as the smallest worked example. Remaining deferred
ideas (per-player permission groups, craft/raid cost config, the recycle/craft/decay calculators
and CCTV camera preview) are tracked in [`TODOLATER.md`](TODOLATER.md).

## Features

- Multi-guild, multi-team: one Discord server can manage several independent in-game teams, each
  with its own Rust+ connection, paired smart devices, and Discord category/channels/role.
- Auto-provisions per-team Discord channels (team chat, alarms, switches, storage monitors,
  servers, player activity, information) and a dedicated role.
- FCM listener auto-pairs smart switches/alarms/storage monitors and registers servers as
  pairing notifications arrive from the Rust+ companion app.
- Web dashboard (React + Discord OAuth login) for toggling modules per guild/team.
- Cross-team chat relay module, with duplicate/echo-loop protection.
- Smart switch/alarm/storage-monitor modules with custom device naming, live-updating status
  embeds, and Discord + in-game commands.
- Map-event alerts (cargo ship, patrol heli, chinook, crates) and proximity-based raid alerts,
  via periodic map-marker polling (Rust+ has no push event for markers).

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

Every other command below is module-owned: it only appears (and is only registered with Discord)
once its module is enabled for that guild/team, and disappears live if disabled — no bot restart.

- `/team-status` (team-tracker) — who's online/offline/dead right now.
- `/switch list|on|off|rename` (smart-switches) — control and rename paired smart switches.
- `/alarm list|rename` (smart-alarms) — list/rename paired smart alarms.
- `/storagemonitor list|view|rename` (storage-monitors) — view/rename paired storage monitors.
- `/events` (map-events) — list currently active cargo ship/patrol heli/chinook/crate events.
- `/raidalert radius` (raid-alerts) — set how close an explosion must be to an online member to
  trigger a ping.
- `/market <item>` (vending-search) — search paired-server vending machines for an item.

In-game team-chat commands follow the same pattern, gated per team: `!online`/`!offline`/`!dead`,
`!switch on|off <name>`/`!switches`, `!alarms`, `!tc <name>`/`!box <name>`, `!pop`/`!time`/`!wipe`,
`!cargo`/`!heli`/`!chinook`/`!crate`/`!events`, `!market <item>`.

## Web dashboard

Visit the bot's web address (`PROTOCOL://HOST:PORT`) and log in with Discord. `/guilds` lists the
servers you can manage (requires `MANAGE_GUILD` permission there); from a guild's `/modules` page
you can toggle each module on/off per team (or per guild, for guild/global-scoped modules).

## Project layout

```
src/
  classes/          DiscordBot, WebServer, FmcListener (core services)
  rustplus/          RustPlus connection lifecycle, snapshot/device/marker helpers
  modules/           Module system: types, registry/dispatcher, and each module's implementation
  discord/           Shared Discord helpers (tracked/live-updating embeds)
  models/            Mongoose models: Guild, Team, User, Server, OAuth, ChatLink
  discordCommands/   Core (always-registered) Discord slash commands
  client/            React web dashboard (pages, layout, routing)
```

## License

MIT
