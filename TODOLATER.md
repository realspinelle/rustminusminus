# TODO Later

Ideas from the original rustminusminus vision that are deferred past the module-system-foundation
pass (see the architecture plan this came from for full context on why these were deferred).

## Game economy config
- Craft cost configuration UI (override/display Rust's crafting costs per item).
- Raid cost configuration UI (explosive/tool costs to raid different structure tiers).

## Feature parity with rustplusplus
- Port the rest of rustplusplus's ~24 commands (smart switches, alarms, storage monitors,
  markers, etc.) as individual modules on top of the new module system, replacing the old
  monolithic if/else command handlers entirely.
- Once switches/alarms/raid-alerts exist as real modules, enforce the corresponding
  `switches.toggle`/`alarms.manage`/`raidalerts.manage` permissions (defined but reserved/unused
  in `src/permissions/definitions.ts` today) against them.

## Cross-team-chat follow-ups
- Link-group management UI in `Modules.tsx` (currently only enable/disable per team; creating
  and editing `ChatLink` groups is Discord-command-only in the foundation pass).
- Consider replacing the visible `RELAY_PREFIX` echo-loop guard with a short-TTL in-memory hash
  of recently-relayed messages, so relayed text doesn't carry a visible marker in-game.
- Consider whether cross-guild links (not just cross-team within one guild) are worth supporting.
