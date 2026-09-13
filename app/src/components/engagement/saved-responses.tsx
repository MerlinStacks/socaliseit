'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { inboxRequest, jsonBody } from './inbox-model';

/** Saved replies append to the composer so inserting one never overwrites a draft. */
export function SavedResponses({ draft, onInsert, disabled }: { draft: string; onInsert: (text: string) => void; disabled: boolean }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const client = useQueryClient();
    const responses = useQuery({
        queryKey: ['inbox-responses'], enabled: open,
        queryFn: () => inboxRequest<{ data: { id: string; name: string; content: string }[] }>('/api/inbox/responses'),
    });
    const save = useMutation({
        mutationFn: () => inboxRequest('/api/inbox/responses', jsonBody({ name: name.trim(), content: draft.trim() }, 'POST')),
        onSuccess: () => { setName(''); client.invalidateQueries({ queryKey: ['inbox-responses'] }); toast('success', 'Response saved'); },
        onError: (error) => toast('error', error.message),
    });
    return <div className="space-y-2 mb-2">
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>Saved responses</Button>
        {open && <div className="rounded-lg border p-3 space-y-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            {responses.isLoading ? <p role="status" className="text-xs">Loading responses…</p> : responses.isError ?
                <div role="alert" className="text-xs">Could not load responses. <button className="underline" onClick={() => responses.refetch()}>Retry</button></div> :
                <div className="max-h-36 overflow-auto space-y-1">
                    {responses.data?.data.length === 0 && <p className="text-xs">No saved responses yet. Save your current draft below.</p>}
                    {responses.data?.data.map(response => <button key={response.id} disabled={disabled} onClick={() => onInsert(response.content)} className="block w-full rounded p-2 text-left hover:bg-[var(--bg-tertiary)] disabled:opacity-50">
                        <span className="block text-xs font-semibold">{response.name}</span><span className="block text-xs line-clamp-2 text-[var(--text-secondary)]">{response.content}</span>
                    </button>)}
                </div>}
            <div className="flex gap-2">
                <input aria-label="Saved response name" placeholder="Name this draft to save it" maxLength={50} value={name} onChange={e => setName(e.target.value)} className="min-w-0 flex-1 rounded border p-2 text-xs bg-[var(--bg-primary)]" />
                <Button size="sm" variant="secondary" onClick={() => save.mutate()} disabled={disabled || save.isPending || !name.trim() || !draft.trim() || draft.trim().length > 2000}>Save</Button>
            </div>
            {draft.trim().length > 2000 && <p className="text-xs">Saved responses can contain up to 2,000 characters.</p>}
        </div>}
    </div>;
}
