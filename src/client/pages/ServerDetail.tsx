import { useState } from "react";
import { Link, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { ArrowLeft, Bell, Box, Clock, Hourglass, Plug, Server, Shield, Users, Zap } from "lucide-react";
import { GuildSubNav } from "../components/GuildSubNav";
import { Toggle } from "../components/Toggle";
import { Lightbox } from "../components/Lightbox";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

interface SwitchState {
    id: string;
    value: boolean;
}

interface AlarmState {
    id: string;
    value: boolean;
    lastTriggered: string | null;
}

type StorageEntity =
    | { id: string; kind: "cupboard"; hasProtection: boolean; protectionExpiry: number | null }
    | {
        id: string;
        kind: "storage";
        capacity: number;
        items: { itemId: number; name: string; shortName: string; quantity: number; isBlueprint: boolean }[];
    };

interface ServerSnapshot {
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    mapName: string;
    wipeTime: number;
    switches: SwitchState[];
    alarms: AlarmState[];
    storage: StorageEntity[];
}

interface ServerDetailResponse {
    serverId: string;
    name: string;
    img: string | null;
    url: string | null;
    ip: string | null;
    port: string | null;
    isActive: boolean;
    pairedItems: { smartSwitch: string[]; smartAlarm: string[]; storageMonitor: string[] };
    live: ServerSnapshot | null;
    liveError: string | null;
}

function relativeTime(iso: string | null): string {
    if (!iso) return "Never";
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function upkeepRemaining(protectionExpiry: number | null): string {
    if (protectionExpiry == null) return "Unknown";
    const remainingMs = protectionExpiry * 1000 - Date.now();
    if (remainingMs <= 0) return "Expired";
    const hours = Math.floor(remainingMs / 3_600_000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h ${Math.floor((remainingMs % 3_600_000) / 60_000)}m`;
}

function upkeepTier(protectionExpiry: number | null): "unknown" | "expired" | "warning" | "safe" {
    if (protectionExpiry == null) return "unknown";
    const remainingMs = protectionExpiry * 1000 - Date.now();
    if (remainingMs <= 0) return "expired";
    if (remainingMs < 6 * 3_600_000) return "warning";
    return "safe";
}

const upkeepTierClass: Record<ReturnType<typeof upkeepTier>, string> = {
    unknown: "bg-surface-hover text-neutral-400",
    expired: "bg-red-500/10 text-red-400",
    warning: "bg-amber-500/10 text-amber-400",
    safe: "bg-emerald-500/10 text-emerald-400",
};

const StatTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div className="flex min-w-32 flex-1 items-center gap-3 px-4 py-3.5">
        {icon}
        <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
            <div className="truncate text-base font-semibold text-white">{value}</div>
        </div>
    </div>
);

const statIconClass = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent";

const SectionCard = ({
    icon,
    title,
    count,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    count: number;
    children: React.ReactNode;
}) => (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="text-neutral-500">{icon}</span>
            <h2 className="text-sm font-medium text-white">{title}</h2>
            <span className="ml-auto rounded-full bg-surface-hover px-2 py-0.5 text-xs text-neutral-500">{count}</span>
        </div>
        {children}
    </section>
);

export async function loader({ params }: LoaderFunctionArgs): Promise<ServerDetailResponse> {
    const { guildId, teamId, serverId } = params;
    const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}`);
    const json = await res.json();
    if (!res.ok || typeof json.serverId !== "string") {
        throw new Response(json?.error ?? "Failed to load this server", { status: res.status });
    }
    return json;
}

export function Component() {
    const { guildId, teamId, serverId } = useParams<{ guildId: string; teamId: string; serverId: string }>();
    const data = useLoaderData() as ServerDetailResponse;
    const revalidator = useRevalidator();
    const [pingedLive, setPingedLive] = useState<ServerSnapshot | null>(null);
    const [pinging, setPinging] = useState(false);
    const [pingError, setPingError] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

    const ping = async () => {
        setPinging(true);
        setPingError(null);
        const res = await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/ping`, { method: "POST" });
        const json = await res.json();
        setPinging(false);
        if (!res.ok) {
            setPingError(json.error ?? "Failed to connect to this server");
            return;
        }
        setPingedLive(json);
    };

    const toggleSwitch = async (entityId: string, value: boolean) => {
        await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/entities/${entityId}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
        });
        revalidator.revalidate();
    };

    if (!guildId || !teamId || !serverId) return null;

    const live = data.live ?? pingedLive;

    return (
        <div className="space-y-6">
            <GuildSubNav guildId={guildId} />

            <Link
                to={`/guild/${guildId}/teams/${teamId}`}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-white"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                {data.name}&apos;s team
            </Link>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5">
                {data.img ? (
                    <img
                        src={data.img}
                        alt=""
                        onClick={() => setLightbox({ src: data.img!, alt: data.name })}
                        className="h-8 w-8 shrink-0 cursor-zoom-in rounded-md border border-border object-cover opacity-80 transition-opacity hover:opacity-100"
                    />
                ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-hover text-neutral-600">
                        <Server className="h-3.5 w-3.5" />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="truncate text-2xl font-semibold text-white">{data.name}</h1>
                    <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-surface-hover px-2 py-0.5 font-mono text-xs text-neutral-400">
                        {data.ip ? `${data.ip}:${data.port}` : data.serverId}
                    </p>
                </div>
                {data.isActive && (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                        Active
                    </span>
                )}
            </div>

            {!live && !data.isActive && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                        <Plug className="h-4.5 w-4.5" />
                    </span>
                    <p className="flex-1 min-w-55 text-sm text-neutral-400">
                        This isn&apos;t the team&apos;s active server, so live device state isn&apos;t loaded automatically.
                        Ping it to connect for a moment and fetch the current state (read-only — switches can
                        only be controlled on the active server).
                    </p>
                    <div>
                        <button
                            onClick={ping}
                            disabled={pinging}
                            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                        >
                            {pinging ? "Connecting…" : "Ping server"}
                        </button>
                        {pingError && <p className="mt-2 text-xs text-red-400">{pingError}</p>}
                    </div>
                </div>
            )}

            {data.liveError && !live && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">
                    {data.liveError}
                </div>
            )}

            {live && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap divide-y divide-border rounded-xl border border-border bg-surface sm:divide-y-0 sm:divide-x">
                        <StatTile icon={<span className={statIconClass}><Users className="h-4 w-4" /></span>} label="Players" value={`${live.players}/${live.maxPlayers}`} />
                        {live.queuedPlayers > 0 && (
                            <StatTile icon={<span className={statIconClass}><Hourglass className="h-4 w-4" /></span>} label="Queued" value={live.queuedPlayers} />
                        )}
                        <StatTile
                            icon={
                                <img
                                    src={`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`}
                                    alt="Server map"
                                    onClick={() =>
                                        setLightbox({
                                            src: `/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`,
                                            alt: "Server map",
                                        })
                                    }
                                    className="h-9 w-9 shrink-0 cursor-zoom-in rounded-lg border border-border object-cover opacity-80 transition-opacity hover:opacity-100"
                                />
                            }
                            label="Map"
                            value={live.mapName}
                        />
                        <StatTile
                            icon={<span className={statIconClass}><Clock className="h-4 w-4" /></span>}
                            label="Wiped"
                            value={relativeTime(new Date(live.wipeTime * 1000).toISOString())}
                        />
                    </div>

                    {live.switches.length > 0 && (
                        <SectionCard icon={<Zap className="h-4 w-4" />} title="Switches" count={live.switches.length}>
                            <div className="grid divide-y divide-border/60 sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(n+3)]:border-border/60">
                                {live.switches.map(sw => (
                                    <div key={sw.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <span className="truncate font-mono text-xs text-neutral-400">{sw.id}</span>
                                        <div className="flex shrink-0 items-center gap-2.5">
                                            <span className={`text-xs font-medium ${sw.value ? "text-accent" : "text-neutral-600"}`}>
                                                {sw.value ? "On" : "Off"}
                                            </span>
                                            {data.isActive ? (
                                                <Toggle
                                                    checked={sw.value}
                                                    onChange={checked => toggleSwitch(sw.id, checked)}
                                                />
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {live.alarms.length > 0 && (
                        <SectionCard icon={<Bell className="h-4 w-4" />} title="Alarms" count={live.alarms.length}>
                            <div className="divide-y divide-border/60">
                                {live.alarms.map(alarm => {
                                    const recent = !!alarm.lastTriggered && Date.now() - new Date(alarm.lastTriggered).getTime() < 10 * 60_000;
                                    return (
                                        <div key={alarm.id} className="flex items-center justify-between px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`h-2 w-2 rounded-full ${recent ? "animate-pulse bg-red-500" : "bg-neutral-700"}`} />
                                                <span className="font-mono text-xs text-neutral-400">{alarm.id}</span>
                                            </div>
                                            <span className="text-xs text-neutral-500">Last triggered: {relativeTime(alarm.lastTriggered)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </SectionCard>
                    )}

                    {live.storage.filter(s => s.kind === "cupboard").length > 0 && (
                        <SectionCard
                            icon={<Shield className="h-4 w-4" />}
                            title="Tool cupboards"
                            count={live.storage.filter(s => s.kind === "cupboard").length}
                        >
                            <div className="divide-y divide-border/60">
                                {live.storage.filter((s): s is Extract<StorageEntity, { kind: "cupboard" }> => s.kind === "cupboard").map(tc => (
                                    <div key={tc.id} className="flex items-center justify-between px-4 py-3">
                                        <span className="font-mono text-xs text-neutral-400">{tc.id}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${upkeepTierClass[upkeepTier(tc.protectionExpiry)]}`}>
                                            {upkeepRemaining(tc.protectionExpiry)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {live.storage.filter(s => s.kind === "storage").length > 0 && (
                        <SectionCard
                            icon={<Box className="h-4 w-4" />}
                            title="Storage"
                            count={live.storage.filter(s => s.kind === "storage").length}
                        >
                            <div className="flex flex-col gap-3 p-3">
                                {live.storage.filter((s): s is Extract<StorageEntity, { kind: "storage" }> => s.kind === "storage").map(box => {
                                    const pct = box.capacity > 0 ? Math.min(100, (box.items.length / box.capacity) * 100) : 0;
                                    return (
                                        <div key={box.id} className="rounded-lg border border-border/60 bg-canvas/40 p-3">
                                            <div className="mb-1.5 flex items-center justify-between">
                                                <span className="font-mono text-xs text-neutral-400">{box.id}</span>
                                                <span className="text-xs text-neutral-500">{box.items.length} / {box.capacity} slots</span>
                                            </div>
                                            <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                                                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                                            </div>
                                            {box.items.length === 0 ? (
                                                <p className="text-xs text-neutral-600">Empty</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {box.items.map((item, i) => (
                                                        <div key={i} className="flex items-center gap-1.5 rounded-md bg-surface-hover px-2 py-1">
                                                            {item.shortName && (
                                                                <img
                                                                    src={`https://cdn.carbonmod.gg/items/${item.shortName}.png`}
                                                                    alt=""
                                                                    className="h-5 w-5"
                                                                />
                                                            )}
                                                            <span className="text-xs text-neutral-200">{item.name}{item.isBlueprint ? " (BP)" : ""} ×{item.quantity}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </SectionCard>
                    )}
                </div>
            )}
            {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
        </div>
    );
}

export const ErrorBoundary = RouteErrorBoundary;
