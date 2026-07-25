import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { Toggle } from "../components/Toggle";
import { Lightbox } from "../components/Lightbox";

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

export default () => {
    const { guildId, teamId, serverId } = useParams<{ guildId: string; teamId: string; serverId: string }>();
    const [data, setData] = useState<ServerDetailResponse | null>(null);
    const [pingedLive, setPingedLive] = useState<ServerSnapshot | null>(null);
    const [pinging, setPinging] = useState(false);
    const [pingError, setPingError] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

    const load = () => {
        if (!guildId || !teamId || !serverId) return;
        fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}`)
            .then(async res => {
                const json = await res.json();
                if (!res.ok || typeof json.serverId !== "string") return;
                setData(json);
            });
    };

    useEffect(load, [guildId, teamId, serverId]);

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
        setTogglingId(entityId);
        await fetch(`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/entities/${entityId}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
        });
        setTogglingId(null);
        load();
    };

    if (!guildId || !teamId || !serverId) return null;
    if (!data) return <div><GuildSubNav guildId={guildId} /><p className="text-sm text-neutral-500">Loading...</p></div>;

    const live = data.live ?? pingedLive;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <Link to={`/guild/${guildId}/teams/${teamId}`} className="text-sm text-neutral-500 hover:text-white">
                ← {data.name}'s team
            </Link>

            <div className="mt-2 mb-6 flex items-center gap-4">
                {data.img && (
                    <img
                        src={data.img}
                        alt=""
                        onClick={() => setLightbox({ src: data.img!, alt: data.name })}
                        className="h-12 w-12 cursor-zoom-in rounded-md object-cover transition-opacity hover:opacity-80"
                    />
                )}
                <div>
                    <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
                    <p className="font-mono text-xs text-neutral-500">{data.ip ? `${data.ip}:${data.port}` : data.serverId}</p>
                </div>
                {data.isActive && (
                    <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">Active</span>
                )}
            </div>

            {!live && !data.isActive && (
                <div className="rounded-lg border border-border bg-surface p-4">
                    <p className="mb-3 text-sm text-neutral-400">
                        This isn't the team's active server, so live device state isn't loaded automatically.
                        Ping it to connect for a moment and fetch the current state (read-only — switches can
                        only be controlled on the active server).
                    </p>
                    <button
                        onClick={ping}
                        disabled={pinging}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                        {pinging ? "Connecting…" : "Ping server"}
                    </button>
                    {pingError && <p className="mt-2 text-xs text-red-400">{pingError}</p>}
                </div>
            )}

            {data.liveError && !live && (
                <p className="text-xs text-red-400">{data.liveError}</p>
            )}

            {live && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-start gap-4">
                        <img
                            src={`/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`}
                            alt="Server map"
                            onClick={() =>
                                setLightbox({
                                    src: `/api/guilds/${guildId}/teams/${teamId}/servers/${serverId}/map`,
                                    alt: "Server map",
                                })
                            }
                            className="h-32 w-32 shrink-0 cursor-zoom-in rounded-md border border-border object-cover transition-opacity hover:opacity-80"
                        />
                        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-lg border border-border bg-surface p-3">
                                <div className="text-xs text-neutral-500">Players</div>
                                <div className="mt-1 text-lg font-semibold text-white">{live.players}/{live.maxPlayers}</div>
                            </div>
                            {live.queuedPlayers > 0 && (
                                <div className="rounded-lg border border-border bg-surface p-3">
                                    <div className="text-xs text-neutral-500">Queued</div>
                                    <div className="mt-1 text-lg font-semibold text-white">{live.queuedPlayers}</div>
                                </div>
                            )}
                            <div className="rounded-lg border border-border bg-surface p-3">
                                <div className="text-xs text-neutral-500">Map</div>
                                <div className="mt-1 text-lg font-semibold text-white">{live.mapName}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-surface p-3">
                                <div className="text-xs text-neutral-500">Wiped</div>
                                <div className="mt-1 text-lg font-semibold text-white">{relativeTime(new Date(live.wipeTime * 1000).toISOString())}</div>
                            </div>
                        </div>
                    </div>

                    {live.switches.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Switches</h2>
                            <div className="flex flex-col gap-2">
                                {live.switches.map(sw => (
                                    <div key={sw.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
                                        <span className="font-mono text-xs text-neutral-400">{sw.id}</span>
                                        <div className="flex items-center gap-3">
                                            <span className={sw.value ? "text-xs text-accent" : "text-xs text-neutral-500"}>{sw.value ? "On" : "Off"}</span>
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
                        </div>
                    )}

                    {live.alarms.length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Alarms</h2>
                            <div className="flex flex-col gap-2">
                                {live.alarms.map(alarm => (
                                    <div key={alarm.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
                                        <span className="font-mono text-xs text-neutral-400">{alarm.id}</span>
                                        <span className="text-xs text-neutral-300">Last triggered: {relativeTime(alarm.lastTriggered)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {live.storage.filter(s => s.kind === "cupboard").length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Tool cupboards</h2>
                            <div className="flex flex-col gap-2">
                                {live.storage.filter((s): s is Extract<StorageEntity, { kind: "cupboard" }> => s.kind === "cupboard").map(tc => (
                                    <div key={tc.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
                                        <span className="font-mono text-xs text-neutral-400">{tc.id}</span>
                                        <span className={tc.protectionExpiry && tc.protectionExpiry * 1000 > Date.now() ? "text-xs text-accent" : "text-xs text-red-400"}>
                                            {upkeepRemaining(tc.protectionExpiry)} upkeep left
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {live.storage.filter(s => s.kind === "storage").length > 0 && (
                        <div>
                            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Storage</h2>
                            <div className="flex flex-col gap-3">
                                {live.storage.filter((s): s is Extract<StorageEntity, { kind: "storage" }> => s.kind === "storage").map(box => (
                                    <div key={box.id} className="rounded-lg border border-border bg-surface p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="font-mono text-xs text-neutral-400">{box.id}</span>
                                            <span className="text-xs text-neutral-500">{box.items.length} / {box.capacity} slots</span>
                                        </div>
                                        {box.items.length === 0 ? (
                                            <p className="text-xs text-neutral-600">Empty</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-3">
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
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
        </div>
    );
};
