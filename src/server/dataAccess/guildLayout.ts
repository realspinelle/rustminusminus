import { GuildModel } from "../../models/Guild";
import { registry } from "../../modules/ModuleRegistry";
import { requireGuildAdmin } from "../../permissions/web";
import { fail, ok } from "./shared";

export async function getGuildEnabledModules(cookieToken: string | undefined, guildId: string) {
    if (!(await requireGuildAdmin(cookieToken, guildId))) {
        return fail(401, "Not authorized");
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const enabled = registry.all()
        .filter(mod => guild.isModuleEnabled(mod.id))
        .map(mod => mod.id);
    return ok(enabled);
}
