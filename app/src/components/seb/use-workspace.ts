'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sebRequest } from './helpers';
import type { Experiment, Recommendation, Workspace } from './types';

export function useWorkspace() {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ['seb-workspace'], queryFn: () => sebRequest<Workspace>('/api/seb/workspace'),
        staleTime: 15_000,
        refetchInterval: query => ['QUEUED', 'RUNNING'].includes(query.state.data?.review?.status || '') ? 5000 : 60_000,
    });
    const refresh = () => client.invalidateQueries({ queryKey: ['seb-workspace'] });
    const generate = useMutation({ mutationFn: () => sebRequest('/api/seb/report/generate', { method: 'POST' }), onSuccess: refresh, onError: refresh });
    const recommendation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: Recommendation['status'] }) => sebRequest(`/api/seb/recommendations/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
        }), onSuccess: refresh,
    });
    const experiment = useMutation({
        mutationFn: ({ id, status }: { id: string; status: Experiment['status'] }) => sebRequest(`/api/seb/experiments/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
        }), onSuccess: refresh,
    });
    const deleteReport = useMutation({ mutationFn: (id: string) => sebRequest(`/api/seb/report/${encodeURIComponent(id)}`, { method: 'DELETE' }), onSuccess: refresh });
    return { query, generate, recommendation, experiment, deleteReport };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
