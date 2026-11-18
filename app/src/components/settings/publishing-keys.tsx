'use client';

import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';

interface PublishingKey {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    expiresAt: string;
    revokedAt: string | null;
}
const endpoint = '/api/settings/publishing-keys';

interface KeyPage { keys: PublishingKey[]; nextCursor: string | null }

async function loadKeys([, , cursor]: [string, string, string | null]) {
    const url = cursor ? `${endpoint}?${new URLSearchParams({ cursor })}` : endpoint;
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load publishing keys');
    return data as KeyPage;
}

/** The plaintext secret lives only in component memory until the user dismisses it. */
export function PublishingKeys({ organizationId }: { organizationId: string }) {
    const [cursors, setCursors] = useState<Array<string | null>>([null]);
    const cursor = cursors[cursors.length - 1];
    const { data, error, isLoading, mutate } = useSWR(['publishing-keys', organizationId, cursor], loadKeys);
    const [name, setName] = useState('');
    const [readOnly, setReadOnly] = useState(false);
    const [allowUpload, setAllowUpload] = useState(false);
    const [allowPostManagement, setAllowPostManagement] = useState(false);
    const [secret, setSecret] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    async function createKey(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, scopes: readOnly ? ['read'] : ['read', 'publish',
                    ...(allowUpload ? ['upload'] : []), ...(allowPostManagement ? ['manage_posts'] : [])] }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not create key');
            setSecret(result.key);
            setName('');
            setCursors([null]);
            if (!cursor) await mutate();
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create key'); }
        finally { setBusy(false); }
    }

    async function revokeKey(id: string) {
        setBusy(true);
        setMessage('');
        try {
            const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
            if (!response.ok) throw new Error('Could not revoke key');
            await mutate();
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not revoke key'); }
        finally { setBusy(false); }
    }

    return (
        <div className="card space-y-4 p-6">
            <h3 className="font-semibold">MCP Publishing</h3>
            <p className="text-sm text-[var(--text-muted)]">
                Connect other software to <code>/api/mcp</code> using Streamable HTTP and a Bearer API key.
                Keys are limited to this workspace and expire after 90 days. Drafts, scheduling, and editing require opt-in. MCP cannot delete posts.
                Read keys can also read workspace analytics when you have that permission.
            </p>
            {secret ? (
                <div className="space-y-2 rounded-lg bg-[var(--bg-tertiary)] p-4">
                    <p className="text-sm font-medium" role="status">Copy this key now. It will not be shown again.</p>
                    <textarea aria-label="New publishing API key" className="input w-full font-mono text-sm" readOnly value={secret}
                        onFocus={event => event.target.select()} />
                    <Button variant="secondary" onClick={() => setSecret('')}>I’ve saved the key</Button>
                </div>
            ) : null}
            {isLoading ? <p role="status">Loading publishing keys…</p> : error ? (
                <p role="alert" className="text-sm text-[var(--text-muted)]">{error.message}</p>
            ) : (
                <>
                    <form onSubmit={createKey} className="space-y-3">
                        <label className="block text-sm">
                            Integration name
                            <input className="input mt-1 w-full" value={name} onChange={event => setName(event.target.value)}
                                placeholder="e.g. Content automation" required maxLength={100} />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={readOnly} onChange={event => setReadOnly(event.target.checked)} />
                            Read-only (no post changes or uploads)
                        </label>
                        {!readOnly ? <>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={allowUpload} onChange={event => setAllowUpload(event.target.checked)} />
                                Allow media uploads
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={allowPostManagement} onChange={event => setAllowPostManagement(event.target.checked)} />
                                Allow drafts, scheduling, and editing
                            </label>
                        </> : null}
                        <Button type="submit" disabled={busy || !!secret || !name.trim()}>Create API Key</Button>
                    </form>
                    <ul className="space-y-3">
                        {data?.keys.map(key => (
                            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-medium">{key.name}</p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {key.keyPrefix}… · {key.scopes.join(', ')} · {key.revokedAt ? 'Revoked' : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}
                                    </p>
                                </div>
                                {!key.revokedAt ? <Button variant="secondary" disabled={busy} onClick={() => revokeKey(key.id)}
                                    aria-label={`Revoke ${key.name}`}>Revoke</Button> : null}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {cursors.length > 1 || data?.nextCursor ? (
                <nav aria-label="Publishing key pages" className="flex items-center gap-3">
                    <Button variant="secondary" disabled={busy || isLoading || cursors.length === 1}
                        onClick={() => setCursors(previous => previous.slice(0, -1))}>Previous keys</Button>
                    <span className="text-sm text-[var(--text-muted)]">Page {cursors.length}</span>
                    <Button variant="secondary" disabled={busy || isLoading || !!error || !data?.nextCursor}
                        onClick={() => { if (data?.nextCursor) setCursors(previous => [...previous, data.nextCursor]); }}>Next keys</Button>
                </nav>
            ) : null}
            {message ? <p role="alert" className="text-sm text-[var(--error)]">{message}</p> : null}
        </div>
    );
}
