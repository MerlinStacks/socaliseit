'use client';

/**
 * Active Sessions Settings Page
 * Displays all active sessions with device info and allows termination
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toast';
import {
    Monitor,
    Smartphone,
    Tablet,
    Globe,
    Clock,
    LogOut,
    Shield,
    AlertTriangle,
    CheckCircle
} from 'lucide-react';

interface SessionData {
    id: string;
    device: string;
    deviceType: string;
    browser: string;
    os: string;
    ipAddress: string;
    lastUsedAt: string;
    createdAt: string;
    isCurrent: boolean;
}

interface SessionsResponse {
    sessions: SessionData[];
}

/**
 * Get appropriate icon for device type
 */
function getDeviceIcon(deviceType: string) {
    switch (deviceType.toLowerCase()) {
        case 'mobile':
            return Smartphone;
        case 'tablet':
            return Tablet;
        default:
            return Monitor;
    }
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

export default function SessionsPage() {
    const queryClient = useQueryClient();
    const [showSignOutAllDialog, setShowSignOutAllDialog] = useState(false);

    // Fetch sessions
    const { data, isLoading, error } = useQuery<SessionsResponse>({
        queryKey: ['sessions'],
        queryFn: async () => {
            const res = await fetch('/api/auth/sessions');
            if (!res.ok) throw new Error('Failed to fetch sessions');
            return res.json();
        },
    });

    // Terminate single session
    const terminateSession = useMutation({
        mutationFn: async (sessionId: string) => {
            const res = await fetch('/api/auth/sessions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
            if (!res.ok) throw new Error('Failed to terminate session');
            return res.json();
        },
        onSuccess: () => {
            toast('success', 'Session terminated');
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
        onError: () => {
            toast('error', 'Failed to terminate session');
        },
    });

    // Terminate all sessions
    const terminateAll = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/auth/sessions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true }),
            });
            if (!res.ok) throw new Error('Failed to sign out all devices');
            return res.json();
        },
        onSuccess: (data) => {
            toast('success', data.message || 'Signed out of all devices');
            setShowSignOutAllDialog(false);
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
        onError: () => {
            toast('error', 'Failed to sign out all devices');
        },
    });

    const sessions = data?.sessions || [];

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <Shield className="w-6 h-6 text-[var(--accent-gold)]" />
                        Active Sessions
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Manage devices where you&apos;re currently signed in
                    </p>
                </div>

                {sessions.length > 1 && (
                    <Button
                        variant="danger"
                        onClick={() => setShowSignOutAllDialog(true)}
                        className="btn-interactive"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign out all devices
                    </Button>
                )}
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="flex justify-center py-16">
                    <LoadingSpinner variant="branded" size="lg" />
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="card p-6 text-center">
                    <AlertTriangle className="w-12 h-12 mx-auto text-[var(--error)] mb-4" />
                    <p className="text-[var(--text-secondary)]">Failed to load sessions</p>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && sessions.length === 0 && (
                <EmptyState
                    variant="default"
                    title="No active sessions"
                    description="You don't have any active sessions."
                />
            )}

            {/* Sessions List */}
            {!isLoading && !error && sessions.length > 0 && (
                <div className="space-y-3">
                    {sessions.map((session, index) => {
                        const DeviceIcon = getDeviceIcon(session.deviceType);
                        const isCurrent = index === 0; // First session is likely current

                        return (
                            <div
                                key={session.id}
                                className={cn(
                                    'card p-4 flex items-center gap-4',
                                    'interactive-scale-subtle',
                                    isCurrent && 'ring-2 ring-[var(--accent-gold)] ring-opacity-50'
                                )}
                            >
                                {/* Device Icon */}
                                <div className={cn(
                                    'w-12 h-12 rounded-xl flex items-center justify-center',
                                    isCurrent
                                        ? 'bg-gradient-to-br from-[var(--accent-gold)] to-[var(--accent-pink)]'
                                        : 'bg-[var(--bg-tertiary)]'
                                )}>
                                    <DeviceIcon className={cn(
                                        'w-6 h-6',
                                        isCurrent ? 'text-white' : 'text-[var(--text-secondary)]'
                                    )} />
                                </div>

                                {/* Device Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-[var(--text-primary)] truncate">
                                            {session.device}
                                        </p>
                                        {isCurrent && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--success-light)] text-[var(--success)]">
                                                <CheckCircle className="w-3 h-3" />
                                                Current
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-muted)]">
                                        <span className="flex items-center gap-1">
                                            <Globe className="w-3.5 h-3.5" />
                                            {session.ipAddress}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            {formatRelativeTime(session.lastUsedAt)}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                {!isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => terminateSession.mutate(session.id)}
                                        disabled={terminateSession.isPending}
                                        className="text-[var(--error)] hover:bg-[var(--error-light)]"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Security Tips */}
            <div className="mt-8 p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
                <h3 className="font-medium text-[var(--text-primary)] mb-2">Security Tips</h3>
                <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                    <li>• Review active sessions regularly</li>
                    <li>• Sign out from devices you don&apos;t recognize</li>
                    <li>• Enable two-factor authentication for extra security</li>
                </ul>
            </div>

            {/* Sign Out All Dialog */}
            <Dialog open={showSignOutAllDialog} onOpenChange={setShowSignOutAllDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                            Sign out all devices?
                        </DialogTitle>
                        <DialogDescription>
                            This will sign you out from all devices including this one.
                            You&apos;ll need to sign in again.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button
                            variant="secondary"
                            onClick={() => setShowSignOutAllDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => terminateAll.mutate()}
                            disabled={terminateAll.isPending}
                        >
                            {terminateAll.isPending ? (
                                <LoadingSpinner size="sm" className="mr-2" />
                            ) : (
                                <LogOut className="w-4 h-4 mr-2" />
                            )}
                            Sign out all
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
