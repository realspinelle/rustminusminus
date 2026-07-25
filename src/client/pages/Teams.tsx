import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";

interface TeamSummary {
    id: string;
    name: string;
    memberCount: number;
    activeServerId: string | null;
    activeServerName: string | null;
}

export default () => {
    const { guildId } = useParams<{ guildId: string }>();
    const navigate = useNavigate();
    const [teams, setTeams] = useState<TeamSummary[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        if (!guildId) return;
        fetch(`/api/guilds/${guildId}/teams`)
            .then((res) => res.json())
            .then((data) => setTeams(Array.isArray(data) ? data : []));
    };

    useEffect(load, [guildId]);

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
        load();
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
                            Provisioning the team's Discord role and channels, this can take a few seconds…
                        </p>
                    )}
                    {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                </div>
            )}
            {teams === null ? (
                <p className="text-sm text-neutral-500">Loading...</p>
            ) : teams.length === 0 ? (
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
};
