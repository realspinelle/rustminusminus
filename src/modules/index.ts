import { registry } from "./ModuleRegistry";
import { crossTeamChat } from "./cross-team-chat/index";
import { teamTracker } from "./team-tracker/index";
import { smartSwitches } from "./smart-switches/index";
import { smartAlarms } from "./smart-alarms/index";
import { storageMonitors } from "./storage-monitors/index";
import { chatRelay } from "./chat-relay/index";
import type { RustModule } from "./types";

export const modules: RustModule[] = [crossTeamChat, teamTracker, smartSwitches, smartAlarms, storageMonitors, chatRelay];

for (const mod of modules) {
    registry.register(mod);
}
