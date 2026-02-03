'use client';

import { useSession } from 'next-auth/react';

export function useWorkspace() {
    const { data: session, status } = useSession();

    const currentWorkspaceId = session?.user?.currentWorkspaceId;
    const workspaces = session?.user?.workspaces || [];

    const workspace = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0];

    return {
        workspace,
        workspaces,
        isLoading: status === 'loading',
        isAuthenticated: status === 'authenticated',
    };
}
