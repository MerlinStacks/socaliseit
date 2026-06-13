'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clientLogger } from '@/lib/client-logger';

interface ListeningClientActionsProps {
    unreadCount: number;
}

export function ListeningClientActions({ unreadCount }: ListeningClientActionsProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const router = useRouter();
    const queryClient = useQueryClient();

    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/listening/sync', { method: 'POST' });
            if (!response.ok) throw new Error('Sync failed');
            await queryClient.invalidateQueries({ queryKey: ['listening-data'] });
            router.refresh();
        } catch (error) {
            clientLogger.error({ error }, 'Failed to sync social listening');
        } finally {
            setIsSyncing(false);
        }
    }, [queryClient, router]);

    return (
        <div className="flex items-center gap-2">
            {unreadCount > 0 && (
                <span className="px-2 py-1 rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)] text-xs font-medium">
                    {unreadCount} new
                </span>
            )}
            <Button variant="secondary" size="sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isSyncing ? 'Listening...' : 'Sync Listening'}
            </Button>
        </div>
    );
}

export function CreateMonitorForm() {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const queryClient = useQueryClient();

    async function handleSubmit(formData: FormData) {
        setIsSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/listening/monitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.get('name'),
                    keywords: String(formData.get('keywords') || '').split(','),
                    excludedTerms: String(formData.get('excludedTerms') || '').split(','),
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to create monitor');
            await queryClient.invalidateQueries({ queryKey: ['listening-data'] });
            router.refresh();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to create monitor');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form action={handleSubmit} className="card p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-semibold">Create listening monitor</h2>
                    <p className="text-sm text-[var(--text-muted)]">Track brand names, competitors, products, campaigns, or issue keywords.</p>
                </div>
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Monitor
                </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm">
                    <span className="mb-1 block text-[var(--text-muted)]">Name</span>
                    <input name="name" className="input w-full" placeholder="Brand reputation" />
                </label>
                <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-[var(--text-muted)]">Keywords</span>
                    <input name="keywords" required className="input w-full" placeholder="brand name, product, #campaign" />
                </label>
                <label className="text-sm md:col-span-3">
                    <span className="mb-1 block text-[var(--text-muted)]">Exclude terms</span>
                    <input name="excludedTerms" className="input w-full" placeholder="jobs, unrelated phrase" />
                </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </form>
    );
}

export function DeleteMonitorButton({ monitorId, monitorName }: { monitorId: string; monitorName: string }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();
    const queryClient = useQueryClient();

    async function handleDelete() {
        if (!window.confirm(`Delete monitor "${monitorName}"? This also removes its listening results.`)) return;

        setIsDeleting(true);
        try {
            const response = await fetch(`/api/listening/monitors/${monitorId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete monitor');
            await queryClient.invalidateQueries({ queryKey: ['listening-data'] });
            router.refresh();
        } catch (error) {
            clientLogger.error({ error, monitorId }, 'Failed to delete listening monitor');
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={isDeleting} title="Delete monitor">
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
    );
}
