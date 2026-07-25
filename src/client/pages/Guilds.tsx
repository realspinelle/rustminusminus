import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "../components/Table";

interface GuildSummary {
    guildId: string;
    name: string;
}

export default () => {
    const [guilds, setGuilds] = useState<GuildSummary[] | null>(null);

    useEffect(() => {
        fetch("/api/guilds")
            .then((res) => res.json())
            .then((data) => setGuilds(Array.isArray(data) ? data : []));
    }, []);

    return (
        <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold text-white">Guilds</h1>
            {guilds === null ? (
                <p className="text-sm text-neutral-500">Loading...</p>
            ) : guilds.length === 0 ? (
                <EmptyState>No guilds found. Invite the bot and grant it access to manage a server.</EmptyState>
            ) : (
                <Table>
                    <Thead>
                        <Th>Guild</Th>
                        <Th>Guild ID</Th>
                        <Th className="text-right">Actions</Th>
                    </Thead>
                    <Tbody>
                        {guilds.map((guild) => (
                            <Tr key={guild.guildId}>
                                <Td className="font-medium text-white">{guild.name}</Td>
                                <Td className="font-mono text-xs text-neutral-500">{guild.guildId}</Td>
                                <Td className="text-right">
                                    <Link
                                        to={`/guild/${guild.guildId}/modules`}
                                        className="rounded-md border border-border px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-accent hover:text-accent"
                                    >
                                        Manage
                                    </Link>
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}
        </div>
    );
};
