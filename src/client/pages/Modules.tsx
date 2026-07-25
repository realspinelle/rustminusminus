import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { Toggle } from "../components/Toggle";

interface TeamSummary {
    id: string;
    name: string;
}

interface ModuleSummary {
    id: string;
    name: string;
    description: string;
    scope: "global" | "guild" | "team";
    guildEnabled: boolean;
    teamEnabled: Record<string, boolean>;
}

interface ModulesResponse {
    teams: TeamSummary[];
    modules: ModuleSummary[];
}

const scopeBadgeClass: Record<ModuleSummary["scope"], string> = {
    global: "bg-surface-hover text-neutral-300",
    guild: "bg-accent/10 text-accent",
    team: "bg-surface-hover text-neutral-300",
};

export default () => {
    const { guildId } = useParams<{ guildId: string }>();
    const [data, setData] = useState<ModulesResponse | null>(null);

    const load = () => {
        if (!guildId) return;
        fetch(`/api/guilds/${guildId}/modules`)
            .then(async (res) => {
                const json = await res.json();
                if (!res.ok || !Array.isArray(json.modules)) return;
                setData(json);
            });
    };

    useEffect(load, [guildId]);

    const toggle = async (moduleId: string, enabled: boolean, teamId?: string) => {
        await fetch(`/api/guilds/${guildId}/modules/${moduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled, teamId }),
        });
        load();
    };

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <h1 className="mb-6 text-2xl font-semibold text-white">Modules</h1>
            {!data ? (
                <p className="text-sm text-neutral-500">Loading...</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {data.modules.map((mod) => (
                        <div key={mod.id} className="rounded-lg border border-border bg-surface p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-white">{mod.name}</span>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${scopeBadgeClass[mod.scope]}`}
                                        >
                                            {mod.scope}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-neutral-400">{mod.description}</p>
                                </div>
                                {mod.scope !== "team" && (
                                    <Toggle
                                        checked={mod.guildEnabled}
                                        onChange={(checked) => toggle(mod.id, checked)}
                                    />
                                )}
                            </div>
                            {mod.scope === "team" && (
                                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                                    {data.teams.map((team) => (
                                        <div key={team.id} className="flex items-center justify-between">
                                            <span className="text-sm text-neutral-300">{team.name}</span>
                                            <Toggle
                                                checked={mod.teamEnabled[team.id] ?? false}
                                                onChange={(checked) => toggle(mod.id, checked, team.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
