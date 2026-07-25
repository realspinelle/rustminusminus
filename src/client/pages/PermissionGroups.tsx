import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";

interface PermissionGroupSummary {
    id: string;
    name: string;
    permissions: string[];
    memberCount: number;
}

export default () => {
    const { guildId } = useParams<{ guildId: string }>();
    const navigate = useNavigate();
    const [groups, setGroups] = useState<PermissionGroupSummary[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        if (!guildId) return;
        fetch(`/api/guilds/${guildId}/permission-groups`)
            .then((res) => res.json())
            .then((data) => setGroups(Array.isArray(data) ? data : []));
    };

    useEffect(load, [guildId]);

    const submit = async () => {
        if (!guildId || !name.trim()) return;
        setSubmitting(true);
        setError(null);
        const res = await fetch(`/api/guilds/${guildId}/permission-groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        const json = await res.json();
        setSubmitting(false);
        if (!res.ok) {
            setError(json.error ?? "Failed to create group");
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
                <h1 className="text-2xl font-semibold text-white">Permissions</h1>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New group
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
                            placeholder="Group name"
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
                    {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                </div>
            )}
            {groups === null ? (
                <p className="text-sm text-neutral-500">Loading...</p>
            ) : groups.length === 0 ? (
                <EmptyState>No permission groups yet. Create one to delegate access without full admin.</EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Group</Th>
                        <Th>Permissions</Th>
                        <Th>Members</Th>
                    </Thead>
                    <Tbody>
                        {groups.map((group) => (
                            <Tr key={group.id} onClick={() => navigate(`/guild/${guildId}/permissions/${group.id}`)}>
                                <Td className="font-medium text-white">{group.name}</Td>
                                <Td className="text-neutral-400">
                                    {group.permissions.length > 0 ? (
                                        group.permissions.join(", ")
                                    ) : (
                                        <span className="text-neutral-600">—</span>
                                    )}
                                </Td>
                                <Td className="text-neutral-400">{group.memberCount}</Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}
        </div>
    );
};
