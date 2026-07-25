import { useState } from "react";
import { Link, useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { MessageSquare, Radio, Send } from "lucide-react";
import { GuildSubNav } from "../components/GuildSubNav";
import { TeamSubNav } from "../components/TeamSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";
import { SectionCard } from "../components/SectionCard";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface TeamMember {
    id: string;
    userId: string;
    displayName: string | null;
    steamId: string;
    steamName: string | null;
}

interface TeamServer {
    serverId: string;
    name: string;
    ip: string | null;
    port: string | null;
    pairedItemCounts: { smartSwitch: number; smartAlarm: number; storageMonitor: number };
}

interface TeamStatus {
    online: string[];
    offline: string[];
    dead: string[];
}

interface RecentChatMessage {
    name: string;
    message: string;
    time: number;
}

interface TeamDetailResponse {
    id: string;
    name: string;
    users: TeamMember[];
    activeServerId: string | null;
    activeCredentialUserId: string | null;
    servers: TeamServer[];
    enabledModules: string[];
    connected: boolean;
    status: TeamStatus | null;
    recentChat: RecentChatMessage[] | null;
    raidAlertRadiusMeters: number | null;
}

interface AddableUser {
    userId: string;
    displayName: string;
}

interface TeamDetailLoaderData {
    team: TeamDetailResponse;
    addableUsers: AddableUser[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<TeamDetailLoaderData> {
    const { guildId, teamId } = params;
    const [teamRes, addableRes] = await Promise.all([
        fetch(`/api/guilds/${guildId}/teams/${teamId}`),
        fetch(`/api/guilds/${guildId}/teams/${teamId}/addable-users`),
    ]);
    const teamJson = await teamRes.json();
    if (!teamRes.ok || !Array.isArray(teamJson.users) || !Array.isArray(teamJson.servers)) {
        throw new Response(teamJson?.error ?? "Failed to load this team", { status: teamRes.status });
    }
    const addableJson = await addableRes.json().catch(() => null);
    return {
        team: teamJson,
        addableUsers: Array.isArray(addableJson) ? addableJson : [],
    };
}

export function Component() {
    const { guildId, teamId } = useParams<{ guildId: string; teamId: string }>();
    const navigate = useNavigate();
    const { team: data, addableUsers } = useLoaderData() as TeamDetailLoaderData;
    const revalidator = useRevalidator();
    const [pending, setPending] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [radiusInput, setRadiusInput] = useState(String(data.raidAlertRadiusMeters ?? ""));
    const [radiusSaving, setRadiusSaving] = useState(false);
    const [radiusError, setRadiusError] = useState<string | null>(null);
    const [chatMessage, setChatMessage] = useState("");
    const [chatSending, setChatSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

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
        revalidator.revalidate();
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
        revalidator.revalidate();
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
        revalidator.revalidate();
    };

    const saveRadius = async () => {
        const meters = Number(radiusInput);
        if (!Number.isFinite(meters) || meters <= 0) {
            setRadiusError("Radius must be a positive number");
            return;
        }
        setRadiusSaving(true);
        setRadiusError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/raid-alert-radius`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ meters }),
        });
        const json = await res.json();
        setRadiusSaving(false);
        if (!res.ok) {
            setRadiusError(json.error ?? "Failed to save");
            return;
        }
        revalidator.revalidate();
    };

    const sendChat = async () => {
        const message = chatMessage.trim();
        if (!message) return;
        setChatSending(true);
        setChatError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
        });
        const json = await res.json();
        setChatSending(false);
        if (!res.ok) {
            setChatError(json.error ?? "Failed to send message");
            return;
        }
        setChatMessage("");
        revalidator.revalidate();
    };

    if (!guildId || !teamId) return null;
    const hasModule = (moduleId: string) => data.enabledModules.includes(moduleId);

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <Link to={`/guild/${guildId}/teams`} className="text-sm text-neutral-500 hover:text-white">
                ← Teams
            </Link>
            <h1 className="mt-2 mb-2 text-2xl font-semibold text-white">{data.name}</h1>
            <TeamSubNav guildId={guildId} teamId={teamId} />
            {actionError && <p className="mb-4 text-sm text-red-400">{actionError}</p>}

            {hasModule("team-tracker") && data.status && (
                <div className="mb-6">
                    <SectionCard icon={<Radio className="h-4 w-4" />} title="Team status">
                        <div className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
                            {(["online", "offline", "dead"] as const).map((key) => (
                                <div key={key} className="p-3">
                                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                                        {key} ({data.status![key].length})
                                    </p>
                                    <p className="text-sm text-neutral-300">{data.status![key].join(", ") || "—"}</p>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                </div>
            )}

            {hasModule("raid-alerts") && (
                <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-surface p-4">
                    <span className="text-sm text-neutral-300">Raid alert radius</span>
                    <input
                        type="number"
                        min={1}
                        value={radiusInput}
                        onChange={(e) => setRadiusInput(e.target.value)}
                        disabled={radiusSaving}
                        className="w-24 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-white focus:border-accent focus:outline-none disabled:opacity-50"
                    />
                    <span className="text-sm text-neutral-500">meters</span>
                    <button
                        onClick={saveRadius}
                        disabled={radiusSaving}
                        className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                        {radiusSaving ? "Saving…" : "Save"}
                    </button>
                    {radiusError && <p className="text-xs text-red-400">{radiusError}</p>}
                </div>
            )}

            {data.connected && (
                <div className="mb-6">
                    <SectionCard icon={<MessageSquare className="h-4 w-4" />} title="Team chat">
                        <div className="max-h-64 overflow-y-auto divide-y divide-border/60">
                            {!data.recentChat || data.recentChat.length === 0 ? (
                                <p className="p-3 text-xs text-neutral-500">No recent messages.</p>
                            ) : (
                                data.recentChat.map((msg, i) => (
                                    <div key={i} className="px-4 py-2">
                                        <span className="text-sm font-medium text-neutral-300">{msg.name}: </span>
                                        <span className="text-sm text-neutral-400">{msg.message}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex items-center gap-2 border-t border-border p-3">
                            <input
                                value={chatMessage}
                                onChange={(e) => setChatMessage(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                                placeholder="Send a message to the team…"
                                disabled={chatSending}
                                className="flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-accent focus:outline-none disabled:opacity-50"
                            />
                            <button
                                onClick={sendChat}
                                disabled={chatSending || !chatMessage.trim()}
                                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                            >
                                <Send className="h-3.5 w-3.5" />
                                {chatSending ? "Sending…" : "Send"}
                            </button>
                        </div>
                        {chatError && <p className="px-3 pb-3 text-xs text-red-400">{chatError}</p>}
                    </SectionCard>
                </div>
            )}

            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Members</h2>
            {data.users.length === 0 ? (
                <EmptyState>No members linked to this team yet.</EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Discord</Th>
                        <Th>Steam</Th>
                        <Th className="text-right">Active credential</Th>
                    </Thead>
                    <Tbody>
                        {data.users.map((user) => {
                            const isActive = user.id === data.activeCredentialUserId;
                            return (
                                <Tr key={user.id}>
                                    <Td>
                                        <div className="text-sm text-white">{user.displayName ?? "Unknown user"}</div>
                                        <div className="font-mono text-xs text-neutral-500">{user.userId}</div>
                                    </Td>
                                    <Td>
                                        <div className="text-sm text-white">{user.steamName ?? "Unknown Steam name"}</div>
                                        <div className="font-mono text-xs text-neutral-500">{user.steamId}</div>
                                    </Td>
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
                {addableUsers.length === 0 ? (
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
                <EmptyState>This team hasn&apos;t paired with any servers yet.</EmptyState>
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
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
