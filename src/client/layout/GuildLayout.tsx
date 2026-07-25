import { Outlet, type LoaderFunctionArgs } from "react-router-dom";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";

export async function loader({ params }: LoaderFunctionArgs): Promise<string[]> {
    const res = await fetch(`/api/guilds/${params.guildId}/enabled-modules`);
    const data = await res.json();
    if (!res.ok) throw new Response(data?.error ?? "Failed to load guild", { status: res.status });
    return Array.isArray(data) ? data : [];
}

export function Component() {
    return <Outlet />;
}

export const ErrorBoundary = RouteErrorBoundary;
