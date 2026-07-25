import { RustPlus } from "rustminus";
import type { TeamClass } from "../models/Team";
import { ServerModel } from "../models/Server";
import { getActiveRustplus } from "./connections";

interface ItemDef {
    name: string;
    shortName: string;
}

let itemCatalog: Map<number, ItemDef> | null = null;
async function getItemCatalog(): Promise<Map<number, ItemDef>> {
    if (itemCatalog) return itemCatalog;
    const raw = (await Bun.file("./items.json").json()) as { Id: number; DisplayName: string; ShortName: string }[];
    itemCatalog = new Map(raw.map(i => [i.Id, { name: i.DisplayName, shortName: i.ShortName }]));
    return itemCatalog;
}

export type StorageEntity =
    | { id: string; kind: "cupboard"; hasProtection: boolean; protectionExpiry: number | null }
    | {
        id: string;
        kind: "storage";
        capacity: number;
        items: { itemId: number; name: string; shortName: string; quantity: number; isBlueprint: boolean }[];
    };

export interface ServerSnapshot {
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    mapName: string;
    wipeTime: number;
    switches: { id: string; value: boolean }[];
    alarms: { id: string; value: boolean; lastTriggered: string | null }[];
    storage: StorageEntity[];
}

type TeamServer = TeamClass["servers"][number];

/**
 * Resolves a RustPlus connection to use for `serverId`: reuses the team's persistent connection
 * when it's their currently-active server, otherwise opens a short-lived one using whichever team
 * member has credentials for it. Callers must disconnect when `ephemeral` is true.
 */
async function resolveConnection(team: TeamClass, serverId: string): Promise<{ rustplus: RustPlus; ephemeral: boolean } | { error: string }> {
    if (serverId === team.activeServerId) {
        const activeConn = getActiveRustplus(team._id);
        if (activeConn) return { rustplus: activeConn, ephemeral: false };
    }

    const users = await team.getUsers();
    let steamId: string | undefined;
    let playerToken: string | undefined;
    for (const user of users) {
        const cred = user.credentials.servers.find(c => c.serverId === serverId);
        if (cred) {
            steamId = user.credentials.steam_id;
            playerToken = cred.playerToken;
            break;
        }
    }
    if (!steamId || !playerToken) return { error: "No team member has credentials for this server" };

    const serverDb = await ServerModel.findOne({ serverId });
    if (!serverDb) return { error: "Server not found" };

    const rustplus = new RustPlus({
        server: serverDb.ip,
        port: Number(serverDb.port),
        playerId: steamId,
        playerToken: Number(playerToken),
        trackTeam: false,
    });
    try {
        await rustplus.connect();
    } catch {
        return { error: "Could not connect to this server" };
    }
    return { rustplus, ephemeral: true };
}

async function buildSnapshot(rustplus: RustPlus, server: TeamServer): Promise<ServerSnapshot> {
    const catalog = await getItemCatalog();
    const info = await rustplus.getInfo();

    const [switches, alarms, storage] = await Promise.all([
        Promise.all(server.pairedItems.smartSwitch.map(async s => {
            const entityInfo = await rustplus.getEntityInfo(Number(s.id));
            return { id: s.id, value: entityInfo.payload?.value ?? false };
        })),
        Promise.all(server.pairedItems.smartAlarm.map(async a => {
            const entityInfo = await rustplus.getEntityInfo(Number(a.id));
            return {
                id: a.id,
                value: entityInfo.payload?.value ?? false,
                lastTriggered: a.lastTriggered ? a.lastTriggered.toISOString() : null,
            };
        })),
        Promise.all(server.pairedItems.storageMonitor.map(async (s): Promise<StorageEntity> => {
            const entityInfo = await rustplus.getEntityInfo(Number(s.id));
            const payload = entityInfo.payload;
            if (payload?.hasProtection) {
                return {
                    id: s.id,
                    kind: "cupboard",
                    hasProtection: true,
                    protectionExpiry: payload.protectionExpiry ?? null,
                };
            }
            const items = (payload?.items ?? []).map(item => {
                const def = catalog.get(item.itemId);
                return {
                    itemId: item.itemId,
                    name: def?.name ?? `Unknown item ${item.itemId}`,
                    shortName: def?.shortName ?? "",
                    quantity: item.quantity,
                    isBlueprint: item.itemIsBlueprint,
                };
            });
            return { id: s.id, kind: "storage", capacity: payload?.capacity ?? 0, items };
        })),
    ]);

    return {
        players: info.players,
        maxPlayers: info.maxPlayers,
        queuedPlayers: info.queuedPlayers,
        mapName: info.map,
        wipeTime: info.wipeTime,
        switches,
        alarms,
        storage,
    };
}

/** Live device/server snapshot for one of a team's paired servers - see {@link resolveConnection}. */
export async function getServerSnapshot(team: TeamClass, serverId: string): Promise<ServerSnapshot | { error: string }> {
    const server = team.servers.find(s => s.serverId === serverId);
    if (!server) return { error: "This team hasn't paired with that server" };

    const conn = await resolveConnection(team, serverId);
    if ("error" in conn) return conn;
    try {
        return await buildSnapshot(conn.rustplus, server);
    } finally {
        if (conn.ephemeral) conn.rustplus.disconnect();
    }
}

/** Raw JPEG map image bytes for a team's paired server - see {@link resolveConnection}. */
export async function getServerMap(team: TeamClass, serverId: string): Promise<Uint8Array | { error: string }> {
    const conn = await resolveConnection(team, serverId);
    if ("error" in conn) return conn;
    try {
        const map = await conn.rustplus.getMap();
        return map.jpgImage;
    } catch {
        return { error: "Could not fetch the map" };
    } finally {
        if (conn.ephemeral) conn.rustplus.disconnect();
    }
}
