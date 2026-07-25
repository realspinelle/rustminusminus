import { useState } from "react";
import { useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface TeamSummary {
    id: string;
    name: string;
    memberCount: number;
    activeServerId: string | null;
    activeServerName: string | null;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<TeamSummary[]> {
    const res = await fetch(`/api/guilds/${params.guildId}/teams`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load teams", { status: res.status });
    return Array.isArray(data) ? data : [];
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const navigate = useNavigate();
    const teams = useLoaderData() as TeamSummary[];
    const revalidator = useRevalidator();
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!guildId || !name.trim()) return;
        setSubmitting(true);
        setError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setError(json.error ?? "Failed to create team");
            return;
        }
        setCreating(false);
        setName("");
        revalidator.revalidate();
    };

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-white">Teams</h1>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New team
                    </button>
                )}
            </div>
            {creating && (
                <div className="mb-6 rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submit()}
                            maxLength={100}
                            placeholder="Team name"
                            disabled={submitting}
                            className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none disabled:opacity-50"
                        />
                        <button
                            onClick={submit}
                            disabled={submitting || !name.trim()}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                        >
                            {submitting ? "Creating…" : "Create"}
                        </button>
                        <button
                            onClick={() => {
                                setCreating(false);
                                setName("");
                                setError(null);
                            }}
                            disabled={submitting}
                            className="rounded-md border border-border px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:text-white disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                    {submitting && (
                        <p className="mt-2 text-xs text-neutral-500">
                            Provisioning the team&apos;s Discord role and channels, this can take a few seconds…
                        </p>
                    )}
                    {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                </div>
            )}
            {teams.length === 0 ? (
                <EmptyState>No teams yet. Create one with the /team create Discord command.</EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Team</Th>
                        <Th>Members</Th>
                        <Th>Active server</Th>
                    </Thead>
                    <Tbody>
                        {teams.map((team) => (
                            <Tr key={team.id} onClick={() => navigate(`/guild/${guildId}/teams/${team.id}`)}>
                                <Td className="font-medium text-white">{team.name}</Td>
                                <Td className="text-neutral-400">{team.memberCount}</Td>
                                <Td className="text-neutral-400">
                                    {team.activeServerName ?? <span className="text-neutral-600">—</span>}
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
