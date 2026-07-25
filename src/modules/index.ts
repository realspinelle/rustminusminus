import { registry } from "./ModuleRegistry";
import { crossTeamChat } from "./cross-team-chat/index";
import { teamTracker } from "./team-tracker/index";
import { smartSwitches } from "./smart-switches/index";
import type { RustModule } from "./types";

export const modules: RustModule[] = [crossTeamChat, teamTracker, smartSwitches];

for (const mod of modules) {
    registry.register(mod);
}
