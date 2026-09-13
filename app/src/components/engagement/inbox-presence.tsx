'use client';

import { PresenceSnapshot } from './use-inbox-presence';

const labels = { viewing: 'viewing', replying: 'drafting a reply', noting: 'writing an internal note (private)' };
export function InboxPresence({ status, participants }: PresenceSnapshot) {
    const replying = status === 'available' && participants.some(person => person.state === 'replying');
    return <div role="status" aria-live="polite" className={`shrink-0 border-b px-4 py-3 text-xs ${replying ? 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100' : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>
        {status === 'unknown' ? <p>Checking teammate presence…</p> : status === 'unavailable' ? <p>Presence unavailable</p> : participants.length ?
            <ul className="space-y-1 break-words">{participants.map(person => <li key={person.userId}><strong>{person.name}</strong> · {labels[person.state]}</li>)}</ul> : <p>No other teammates currently present.</p>}
        {replying && <p className="font-semibold mt-2">A teammate is drafting a reply. Coordinate to avoid duplicate responses.</p>}
        <p className="mt-1">Advisory only — this conversation is not locked. You can still reply or add a private note.</p>
    </div>;
}
