import { useNavigate, useParams, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";
import { GuildSubNav } from "../components/GuildSubNav";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { CreateEntityForm } from "../components/CreateEntityForm";
import { useCreateEntity } from "../hooks/useCreateEntity";

interface PermissionGroupSummary {
    id: string;
    name: string;
    permissions: string[];
    memberCount: number;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<PermissionGroupSummary[]> {
    const res = await fetch(`/api/guilds/${params.guildId}/permission-groups`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load permission groups", { status: res.status });
    return Array.isArray(data) ? data : [];
}

export function Component() {
    const { guildId } = useParams<{ guildId: string }>();
    const navigate = useNavigate();
    const groups = useLoaderData() as PermissionGroupSummary[];
    const revalidator = useRevalidator();
    const create = useCreateEntity(`/api/guilds/${guildId}/permission-groups`, "Failed to create group", () => revalidator.revalidate());

    if (!guildId) return null;

    return (
        <div>
            <GuildSubNav guildId={guildId} />
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-white">Permissions</h1>
                {!create.creating && (
                    <button
                        onClick={() => create.setCreating(true)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-hover"
                    >
                        New group
                    </button>
                )}
            </div>
            <CreateEntityForm
                creating={create.creating}
                name={create.name}
                submitting={create.submitting}
                error={create.error}
                placeholder="Group name"
                onNameChange={create.setName}
                onSubmit={create.submit}
                onCancel={create.cancel}
            />
            {groups.length === 0 ? (
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
}

export const ErrorBoundary = RouteErrorBoundary;
