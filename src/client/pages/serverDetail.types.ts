export interface SwitchState {
    id: string;
    value: boolean;
}

export interface AlarmState {
    id: string;
    value: boolean;
    lastTriggered: string | null;
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
    switches: SwitchState[];
    alarms: AlarmState[];
    storage: StorageEntity[];
}

export interface ServerDetailResponse {
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
