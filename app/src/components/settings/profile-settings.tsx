'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Shield, Check, Loader2, Copy } from 'lucide-react';

interface ProfileSettingsProps {
    user: {
        name: string;
        email: string;
        image: string | null;
    };
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
    const initials = user.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';

    return (
        <div className="space-y-8">
            {/* Profile Section */}
            <div>
                <h2 className="text-xl font-semibold mb-6">Profile</h2>

                <div className="card p-6 space-y-6">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                        {user.image ? (
                            <img src={user.image} alt={user.name} className="h-20 w-20 rounded-full object-cover" />
                        ) : (
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient text-2xl font-bold text-white">
                                {initials}
                            </div>
                        )}
                        <div>
                            <Button variant="secondary" className="mb-1">Change Avatar</Button>
                            <p className="text-xs text-[var(--text-muted)]">JPG, PNG, or GIF. Max 5MB.</p>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">Full Name</label>
                        <Input
                            type="text"
                            defaultValue={user.name}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">Email</label>
                        <Input
                            type="email"
                            defaultValue={user.email}
                            disabled
                            className="opacity-50"
                        />
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Contact support to change email</p>
                    </div>

                    <Button>Save Changes</Button>
                </div>
            </div>

            {/* Security Section */}
            <div>
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security
                </h2>

                <div className="space-y-4">
                    <TwoFactorAuthCard />
                    <ActiveSessionsCard />
                    <DeleteAccountCard />
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// TWO-FACTOR AUTHENTICATION CARD
// ============================================================================

function TwoFactorAuthCard() {
    const [status, setStatus] = useState<{ enabled: boolean; backupCodesCount: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [showDisableModal, setShowDisableModal] = useState(false);
    const [setupData, setSetupData] = useState<{ qrCode: string; secret: string } | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchStatus();
    }, []);

    async function fetchStatus() {
        try {
            const res = await fetch('/api/user/2fa');
            const data = await res.json();
            setStatus({ enabled: data.enabled, backupCodesCount: data.backupCodesCount || 0 });
        } catch (err) {
            console.error('Failed to fetch 2FA status:', err);
        } finally {
            setLoading(false);
        }
    }

    async function startSetup() {
        setError(null);
        setActionLoading(true);
        try {
            const res = await fetch('/api/user/2fa', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setSetupData({ qrCode: data.qrCode, secret: data.secret });
                setShowSetupModal(true);
            } else {
                setError(data.error || 'Failed to start 2FA setup');
            }
        } catch (err) {
            console.error('Failed to start 2FA setup:', err);
            setError('Failed to start 2FA setup');
        } finally {
            setActionLoading(false);
        }
    }

    async function verifyAndEnable() {
        if (verifyCode.length !== 6) {
            setError('Please enter a 6-digit code');
            return;
        }
        setError(null);
        setActionLoading(true);
        try {
            const res = await fetch('/api/user/2fa', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: verifyCode }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setBackupCodes(data.backupCodes);
                await fetchStatus();
            } else {
                setError(data.error || 'Invalid code');
            }
        } catch (err) {
            console.error('Failed to verify 2FA:', err);
            setError('Verification failed');
        } finally {
            setActionLoading(false);
        }
    }

    async function disable2FA() {
        if (!disablePassword) {
            setError('Password is required');
            return;
        }
        setError(null);
        setActionLoading(true);
        try {
            const res = await fetch('/api/user/2fa', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: disablePassword }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setShowDisableModal(false);
                setDisablePassword('');
                await fetchStatus();
            } else {
                setError(data.error || 'Failed to disable 2FA');
            }
        } catch (err) {
            console.error('Failed to disable 2FA:', err);
            setError('Failed to disable 2FA');
        } finally {
            setActionLoading(false);
        }
    }

    function closeSetupModal() {
        setShowSetupModal(false);
        setSetupData(null);
        setBackupCodes(null);
        setVerifyCode('');
        setError(null);
    }

    if (loading) {
        return (
            <div className="card p-6">
                <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-[var(--text-muted)]">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-semibold">Two-Factor Authentication</h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                            {status?.enabled
                                ? 'Your account is protected with 2FA'
                                : 'Add an extra layer of security to your account'}
                        </p>
                    </div>
                    {status?.enabled && (
                        <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-2 py-0.5 text-xs font-medium text-[var(--success)]">
                            <Check className="h-3 w-3" />
                            Enabled
                        </span>
                    )}
                </div>
                {status?.enabled ? (
                    <Button variant="secondary" onClick={() => setShowDisableModal(true)}>
                        Disable 2FA
                    </Button>
                ) : (
                    <Button variant="secondary" onClick={startSetup} disabled={actionLoading}>
                        {actionLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up...</> : 'Enable 2FA'}
                    </Button>
                )}
            </div>

            {/* Setup Dialog */}
            <Dialog open={showSetupModal} onOpenChange={closeSetupModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {backupCodes ? '2FA Enabled!' : 'Set Up Two-Factor Authentication'}
                        </DialogTitle>
                        <DialogDescription>
                            {backupCodes
                                ? 'Save these backup codes in a safe place.'
                                : 'Scan this QR code with your authenticator app.'}
                        </DialogDescription>
                    </DialogHeader>

                    {backupCodes ? (
                        <>
                            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 mb-4">
                                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                                    {backupCodes.map((code, i) => (
                                        <div key={i} className="px-2 py-1 bg-[var(--bg-secondary)] rounded">
                                            {code}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <p className="text-xs text-[var(--warning)] mb-4">
                                ⚠️ These codes will only be shown once!
                            </p>
                            <DialogFooter>
                                <Button onClick={closeSetupModal} className="w-full">
                                    I&apos;ve Saved My Codes
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            {setupData && (
                                <div className="flex justify-center mb-4">
                                    <img src={setupData.qrCode} alt="2FA QR Code" className="rounded-lg" />
                                </div>
                            )}
                            <p className="text-xs text-[var(--text-muted)] mb-4 text-center">
                                Or enter this code manually: <code className="bg-[var(--bg-tertiary)] px-2 py-1 rounded">{setupData?.secret}</code>
                            </p>
                            <div className="mb-4">
                                <label className="mb-2 block text-sm font-medium">Enter 6-digit code</label>
                                <Input
                                    type="text"
                                    maxLength={6}
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    className="text-center text-lg font-mono tracking-widest"
                                />
                            </div>
                            {error && (
                                <p className="text-sm text-[var(--error)] mb-4">{error}</p>
                            )}
                            <DialogFooter className="flex gap-3">
                                <Button variant="secondary" onClick={closeSetupModal} className="flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={verifyAndEnable} disabled={actionLoading} className="flex-1">
                                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Enable'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Disable Dialog */}
            <Dialog open={showDisableModal} onOpenChange={setShowDisableModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
                        <DialogDescription>
                            Enter your password to disable 2FA. This will make your account less secure.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium">Password</label>
                        <Input
                            type="password"
                            value={disablePassword}
                            onChange={(e) => setDisablePassword(e.target.value)}
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-[var(--error)] mb-4">{error}</p>
                    )}
                    <DialogFooter className="flex gap-3">
                        <Button variant="secondary" onClick={() => { setShowDisableModal(false); setError(null); setDisablePassword(''); }} className="flex-1">
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={disable2FA} disabled={actionLoading} className="flex-1">
                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable 2FA'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ============================================================================
// ACTIVE SESSIONS CARD
// ============================================================================

interface SessionData {
    id: string;
    deviceName: string;
    ipAddress: string;
    lastUsedAt: string;
    isCurrent: boolean;
}

function ActiveSessionsCard() {
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
            console.error('Failed to fetch sessions:', err);
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
            console.error('Failed to revoke session:', err);
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
            console.error('Failed to revoke sessions:', err);
        } finally {
            setRevoking(null);
        }
    }

    function formatDate(iso: string): string {
        const date = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
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
                                    {session.ipAddress} • {formatDate(session.lastUsedAt)}
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

// ============================================================================
// DELETE ACCOUNT CARD
// ============================================================================

function DeleteAccountCard() {
    const [showModal, setShowModal] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDelete() {
        if (confirmation !== 'DELETE') {
            setError('Please type DELETE to confirm');
            return;
        }
        setError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/user/delete-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, confirmation }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                // Redirect to login after deletion
                window.location.href = '/login?deleted=true';
            } else {
                setError(data.error || 'Failed to delete account');
            }
        } catch (err) {
            console.error('Failed to delete account:', err);
            setError('Failed to delete account');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <div className="card border-[var(--error)] p-6">
                <h3 className="font-semibold text-[var(--error)] mb-4">Danger Zone</h3>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                    Permanently delete your account and all associated data
                </p>
                <Button variant="danger" onClick={() => setShowModal(true)}>
                    Delete Account
                </Button>
            </div>

            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-[var(--error)]">Delete Account</DialogTitle>
                        <DialogDescription>
                            This action is <strong>permanent</strong> and cannot be undone. All your data, including workspaces, posts, and media, will be deleted.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mb-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                Type <code className="bg-[var(--bg-tertiary)] px-1 rounded">DELETE</code> to confirm
                            </label>
                            <Input
                                type="text"
                                value={confirmation}
                                onChange={(e) => setConfirmation(e.target.value)}
                                placeholder="DELETE"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-[var(--error)] mb-4">{error}</p>
                    )}

                    <DialogFooter className="flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => { setShowModal(false); setPassword(''); setConfirmation(''); setError(null); }}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            disabled={loading || confirmation !== 'DELETE'}
                            className="flex-1"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Forever'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
