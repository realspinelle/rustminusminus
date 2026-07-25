export type PermissionId =
    | "modules.manage"
    | "chatlinks.manage"
    | "switches.toggle"
    | "alarms.manage"
    | "raidalerts.manage";

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
        description: "Reserved — no alarms module yet.",
        status: "reserved",
    },
    {
        id: "raidalerts.manage",
        label: "Manage raid alerts",
        description: "Reserved — no raid-alerts module yet.",
        status: "reserved",
    },
];
