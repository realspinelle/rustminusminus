export interface SwitchState {
    id: string;
    name: string;
    value: boolean;
}

export interface AlarmState {
    id: string;
    name: string;
    value: boolean;
    lastTriggered: string | null;
}

export type StorageEntity =
    | { id: string; name: string; kind: "cupboard"; hasProtection: boolean; protectionExpiry: number | null }
    | {
        id: string;
        name: string;
        kind: "storage";
        capacity: number;
        items: { itemId: number; name: string; shortName: string; quantity: number; isBlueprint: boolean }[];
    };

export interface MapEvent {
    type: string;
    label: string;
    grid: string;
}

export interface ServerSnapshot {
    players: number;
    maxPlayers: number;
    queuedPlayers: number;
    mapName: string;
    wipeTime: number;
    switches: SwitchState[];
    alarms: AlarmState[];
    storage: StorageEntity[];
    activeEvents: MapEvent[];
}

export interface ServerDetailResponse {
    serverId: string;
    name: string;
    img: string | null;
    url: string | null;
    ip: string | null;
    port: string | null;
    isActive: boolean;
    enabledModules: string[];
    pairedItems: { smartSwitch: string[]; smartAlarm: string[]; storageMonitor: string[] };
    live: ServerSnapshot | null;
    liveError: string | null;
}
