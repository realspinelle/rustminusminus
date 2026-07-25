import { useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { Toggle } from "../components/Toggle";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

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

export async function loader({ params }: LoaderFunctionArgs): Promise<ModulesResponse> {
    const res = await fetch(`/api/guilds/${params.guildId}/modules`);
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.modules)) {
        throw new Response(json?.error ?? "Failed to load modules", { status: res.status });
    }
    return json;
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const data = useLoaderData() as ModulesResponse;
    const revalidator = useRevalidator();

    const toggle = async (moduleId: string, enabled: boolean, teamId?: string) => {
        await fetch(`/api/guilds/${guildId}/modules/${moduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled, teamId }),
        });
        revalidator.revalidate();
    };

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <h1 className="mb-6 text-2xl font-semibold text-white">Modules</h1>
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
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
