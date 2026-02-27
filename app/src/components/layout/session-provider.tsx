'use client';

/**
 * Session context provider for SPA-mode dashboard.
 *
 * Why: Server pages called `getSession()` individually on every navigation,
 * adding a server round-trip. This context fetches session data once from a
 * lightweight API route and shares it across all client-side dashboard views.
 *
 * The server layout passes initial session data as props so the first render
 * is instant (no flash of unauthenticated state).
 */

import { createContext, useContext, type ReactNode } from 'react';

export interface DashboardSession {
    userId: string;
    userName: string;
    userEmail: string;
    userImage: string | null;
    currentOrganizationId: string;
    isSuperAdmin: boolean;
}

const SessionContext = createContext<DashboardSession | null>(null);

/**
 * Hook to access the dashboard session from any client component.
 * Throws if used outside a SessionProvider — ensures auth is always present.
 */
export function useDashboardSession(): DashboardSession {
    const session = useContext(SessionContext);
    if (!session) {
        throw new Error(
            'useDashboardSession must be used within a <DashboardSessionProvider>',
        );
    }
    return session;
}

interface DashboardSessionProviderProps {
    session: DashboardSession;
    children: ReactNode;
}

/**
 * Wraps dashboard children with session context.
 * Receives pre-validated session data from the server layout — no client
 * fetch needed.
 */
export function DashboardSessionProvider({
    session,
    children,
}: DashboardSessionProviderProps) {
    return (
        <SessionContext.Provider value={session}>
            {children}
        </SessionContext.Provider>
    );
}
