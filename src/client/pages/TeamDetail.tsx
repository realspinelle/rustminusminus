import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";

interface TeamMember {
    id: string;
    userId: string;
}

interface TeamServer {
    serverId: string;
    name: string;
    ip: string | null;
    port: string | null;
    pairedItemCounts: { smartSwitch: number; smartAlarm: number; storageMonitor: number };
}

interface TeamDetailResponse {
    id: string;
    name: string;
    users: TeamMember[];
    activeServerId: string | null;
    activeCredentialUserId: string | null;
    servers: TeamServer[];
}

interface AddableUser {
    userId: string;
    displayName: string;
}

export default () => {
    const { guildId, teamId } = useParams<{ guildId: string; teamId: string }>();
    const navigate = useNavigate();
    const [data, setData] = useState<TeamDetailResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [addableUsers, setAddableUsers] = useState<AddableUser[] | null>(null);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = () => {
        if (!guildId || !teamId) return;
        fetch(`/api/guilds/${guildId}/teams/${teamId}`)
            .then(async (res) => {
                const json = await res.json();
                if (!res.ok || !Array.isArray(json.users) || !Array.isArray(json.servers)) {
                    setLoadError(json.error ?? "Failed to load this team");
                    return;
                }
                setLoadError(null);
                setData(json);
            })
            .catch(() => setLoadError("Failed to load this team"));
    };

    const loadAddableUsers = () => {
        if (!guildId || !teamId) return;
        fetch(`/api/guilds/${guildId}/teams/${teamId}/addable-users`)
            .then((res) => res.json())
            .then((json) => setAddableUsers(Array.isArray(json) ? json : []));
    };

    useEffect(load, [guildId, teamId]);
    useEffect(loadAddableUsers, [guildId, teamId]);

    const addMember = async () => {
        if (!selectedUserId) return;
        setAddSubmitting(true);
        setAddError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: selectedUserId }),
        });
        const json = await res.json();
        setAddSubmitting(false);
        if (!res.ok) {
            setAddError(json.error ?? "Failed to add member");
            return;
        }
        setSelectedUserId("");
        load();
        loadAddableUsers();
    };

    const setActiveServer = async (serverId: string) => {
        setPending(serverId);
        setActionError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/active-server`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverId }),
        });
        const json = await res.json();
        setPending(null);
        if (!res.ok) {
            setActionError(json.error ?? "Failed to set active server");
            return;
        }
        load();
    };

    const setActiveCredentialUser = async (userId: string) => {
        setPending(userId);
        setActionError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/active-credential-user`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
        });
        const json = await res.json();
        setPending(null);
        if (!res.ok) {
            setActionError(json.error ?? "Failed to set active credential user");
            return;
        }
        load();
    };

    if (!guildId || !teamId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <Link to={`/guild/${guildId}/teams`} className="text-sm text-neutral-500 hover:text-white">
                ← Teams
            </Link>
            {loadError && (
                <p className="mt-4 text-sm text-red-400">{loadError} — <button onClick={load} className="underline hover:text-white">retry</button></p>
            )}
            {!data ? (
                loadError ? null : <p className="mt-4 text-sm text-neutral-500">Loading...</p>
            ) : (
                <>
                    <h1 className="mt-2 mb-6 text-2xl font-semibold text-white">{data.name}</h1>
                    {actionError && <p className="mb-4 text-sm text-red-400">{actionError}</p>}

                    <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Members</h2>
                    {data.users.length === 0 ? (
                        <EmptyState>No members linked to this team yet.</EmptyState>
                    ) : (
                        <Table>
                            <Thead>
                                <Th>Discord user</Th>
                                <Th className="text-right">Active credential</Th>
                            </Thead>
                            <Tbody>
                                {data.users.map((user) => {
                                    const isActive = user.id === data.activeCredentialUserId;
                                    return (
                                        <Tr key={user.id}>
                                            <Td className="font-mono text-xs text-neutral-300">{user.userId}</Td>
                                            <Td className="text-right">
                                                {isActive ? (
                                                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => setActiveCredentialUser(user.id)}
                                                        disabled={pending === user.id}
                                                        className="rounded-md border border-border px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                                                    >
                                                        Set active
                                                    </button>
                                                )}
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </Tbody>
                        </Table>
                    )}

                    <div className="mt-3 rounded-lg border border-border bg-surface p-4">
                        {addableUsers === null ? (
                            <p className="text-xs text-neutral-500">Loading linkable users...</p>
                        ) : addableUsers.length === 0 ? (
                            <p className="text-xs text-neutral-500">
                                No linkable users available — they need to run{" "}
                                <span className="font-mono">/credentials add</span> and be a member of this
                                server.
                            </p>
                        ) : (
                            <div className="flex items-center gap-2">
                                <select
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                    disabled={addSubmitting}
                                    className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50"
                                >
                                    <option value="">Select a user to add…</option>
                                    {addableUsers.map((u) => (
                                        <option key={u.userId} value={u.userId}>
                                            {u.displayName}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={addMember}
                                    disabled={addSubmitting || !selectedUserId}
                                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                                >
                                    {addSubmitting ? "Adding…" : "Add"}
                                </button>
                            </div>
                        )}
                        {addError && <p className="mt-2 text-xs text-red-400">{addError}</p>}
                    </div>

                    <h2 className="mt-8 mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
                        Servers
                    </h2>
                    {data.servers.length === 0 ? (
                        <EmptyState>This team hasn't paired with any servers yet.</EmptyState>
                    ) : (
                        <Table>
                            <Thead>
                                <Th>Server</Th>
                                <Th>Address</Th>
                                <Th>Paired items</Th>
                                <Th className="text-right">Active</Th>
                            </Thead>
                            <Tbody>
                                {data.servers.map((server) => {
                                    const isActive = server.serverId === data.activeServerId;
                                    return (
                                        <Tr
                                            key={server.serverId}
                                            onClick={() => navigate(`/guild/${guildId}/teams/${teamId}/servers/${server.serverId}`)}
                                        >
                                            <Td className="font-medium text-white">{server.name}</Td>
                                            <Td className="font-mono text-xs text-neutral-500">
                                                {server.ip ? `${server.ip}:${server.port}` : "—"}
                                            </Td>
                                            <Td className="text-neutral-400">
                                                {server.pairedItemCounts.smartSwitch} switches ·{" "}
                                                {server.pairedItemCounts.smartAlarm} alarms ·{" "}
                                                {server.pairedItemCounts.storageMonitor} storage monitors
                                            </Td>
                                            <Td className="text-right">
                                                {isActive ? (
                                                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveServer(server.serverId);
                                                        }}
                                                        disabled={pending === server.serverId}
                                                        className="rounded-md border border-border px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                                                    >
                                                        Set active
                                                    </button>
                                                )}
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </Tbody>
                        </Table>
                    )}
                </>
            )}
        </div>
    );
};
