import { useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { Toggle } from "../components/Toggle";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface ModuleSummary {
    id: string;
    name: string;
    description: string;
    scope: "global";
    enabled: boolean;
}

interface GlobalModulesResponse {
    modules: ModuleSummary[];
}

export async function loader(_args: LoaderFunctionArgs): Promise<GlobalModulesResponse> {
    const res = await fetch("/api/modules");
    const json = await res.json();
    if (!res.ok || !Array.isArray(json.modules)) {
        throw new Response(json?.error ?? "Failed to load global modules", { status: res.status });
    }
    return json;
}

export function Component() {
    const data = useLoaderData() as GlobalModulesResponse;
    const revalidator = useRevalidator();

    const toggle = async (moduleId: string, enabled: boolean) => {
        await fetch(`/api/modules/${moduleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
        });
        revalidator.revalidate();
    };

    return (
        <div>
            <h1 className="mb-1 text-2xl font-semibold text-white">Global Modules</h1>
            <p className="mb-6 text-sm text-neutral-500">Bot-wide modules. Only the bot owner can toggle these.</p>
            {data.modules.length === 0 ? (
                <p className="text-sm text-neutral-500">No global modules registered.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {data.modules.map((mod) => (
                        <div key={mod.id} className="rounded-lg border border-border bg-surface p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <span className="font-medium text-white">{mod.name}</span>
                                    <p className="mt-1 text-sm text-neutral-400">{mod.description}</p>
                                </div>
                                <Toggle
                                    checked={mod.enabled}
                                    onChange={(checked) => toggle(mod.id, checked)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
