import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive ? "bg-surface text-white" : "text-neutral-400 hover:text-white"
    }`;

export const GuildSubNav = ({ guildId }: { guildId: string }) => (
    <nav className="mb-6 flex gap-1 border-b border-border pb-4">
        <NavLink to={`/guild/${guildId}/modules`} className={linkClass}>
            Modules
        </NavLink>
        <NavLink to={`/guild/${guildId}/teams`} className={linkClass}>
            Teams
        </NavLink>
        <NavLink to={`/guild/${guildId}/permissions`} className={linkClass}>
            Permissions
        </NavLink>
    </nav>
);
