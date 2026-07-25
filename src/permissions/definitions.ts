export type PermissionId =
    | "modules.manage"
    | "chatlinks.manage"
    | "switches.toggle"
    | "alarms.manage"
    | "raidalerts.manage"
    | "storagemonitors.manage"
    | "mapevents.manage";

export interface PermissionDefinition {
    id: PermissionId;
    label: string;
    description: string;
    status: "enforced" | "reserved";
}

export const PERMISSIONS: PermissionDefinition[] = [
    {
        id: "modules.manage",
        label: "Manage modules",
        description: "Enable/disable modules per guild or team.",
        status: "enforced",
    },
    {
        id: "chatlinks.manage",
        label: "Manage chat links",
        description: "Create/edit cross-team chat link groups.",
        status: "enforced",
    },
    {
        id: "switches.toggle",
        label: "Toggle switches",
        description: "Toggle and rename paired smart switches.",
        status: "enforced",
    },
    {
        id: "alarms.manage",
        label: "Manage alarms",
        description: "Rename and list paired smart alarms.",
        status: "enforced",
    },
    {
        id: "raidalerts.manage",
        label: "Manage raid alerts",
        description: "Configure the raid-alert proximity radius.",
        status: "enforced",
    },
    {
        id: "storagemonitors.manage",
        label: "Manage storage monitors",
        description: "Rename and list paired storage monitors/tool cupboards.",
        status: "enforced",
    },
    {
        id: "mapevents.manage",
        label: "Manage map events",
        description: "Reserved — no map-events module yet.",
        status: "reserved",
    },
];
