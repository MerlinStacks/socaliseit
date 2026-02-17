'use client';

/**
 * Active Sessions Card
 * Why: Displays all active sessions with the ability to revoke individual
 * or all non-current sessions for security management.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/formatters';
import { showErrorToast } from '@/lib/api-error';

interface SessionData {
    id: string;
    deviceName: string;
    ipAddress: string;
    lastUsedAt: string;
    isCurrent: boolean;
}

export function ActiveSessionsCard() {
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);

    useEffect(() => {
        fetchSessions();
    }, []);

    async function fetchSessions() {
        try {
            const res = await fetch('/api/user/sessions');
            const data = await res.json();
            setSessions(data.sessions || []);
        } catch (err) {
            showErrorToast(err, 'Failed to fetch sessions');
        } finally {
            setLoading(false);
        }
    }

    async function revokeSession(sessionId: string) {
        setRevoking(sessionId);
        try {
            const res = await fetch('/api/user/sessions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
            if (res.ok) {
                setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            }
        } catch (err) {
            showErrorToast(err, 'Failed to revoke session');
        } finally {
            setRevoking(null);
        }
    }

    async function revokeAllOther() {
        setRevoking('all');
        try {
            const res = await fetch('/api/user/sessions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revokeAll: true }),
            });
            if (res.ok) {
                setSessions((prev) => prev.filter((s) => s.isCurrent));
            }
        } catch (err) {
            showErrorToast(err, 'Failed to revoke sessions');
        } finally {
            setRevoking(null);
        }
    }

    return (
        <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Active Sessions</h3>
                {sessions.filter((s) => !s.isCurrent).length > 0 && (
                    <Button
                        variant="secondary"
                        onClick={revokeAllOther}
                        disabled={revoking === 'all'}
                        className="text-xs"
                    >
                        {revoking === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke All Others'}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-[var(--text-muted)]">Loading sessions...</span>
                </div>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No active sessions found</p>
            ) : (
                <div className="space-y-3">
                    {sessions.map((session) => (
                        <div key={session.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                            <div>
                                <p className="font-medium text-sm">{session.deviceName}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    {session.ipAddress} • {formatRelativeTime(session.lastUsedAt)}
                                </p>
                            </div>
                            {session.isCurrent ? (
                                <span className="rounded-full bg-[var(--success-light)] px-2 py-0.5 text-xs font-medium text-[var(--success)]">
                                    Current
                                </span>
                            ) : (
                                <button
                                    onClick={() => revokeSession(session.id)}
                                    disabled={revoking === session.id}
                                    className="text-xs text-[var(--error)] hover:underline disabled:opacity-50"
                                >
                                    {revoking === session.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
