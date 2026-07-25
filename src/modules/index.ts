import { registry } from "./ModuleRegistry";
import { crossTeamChat } from "./cross-team-chat/index";
import type { RustModule } from "./types";

export const modules: RustModule[] = [crossTeamChat];

for (const mod of modules) {
    registry.register(mod);
}
