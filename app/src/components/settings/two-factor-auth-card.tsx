'use client';

/**
 * Two-Factor Authentication Card
 * Why: Self-contained 2FA setup/disable flow with QR code scanning,
 * verification code entry, and backup code display.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Check, Loader2 } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';

export function TwoFactorAuthCard() {
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
            showErrorToast(err, 'Failed to fetch 2FA status');
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
            showErrorToast(err, 'Failed to start 2FA setup');
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
            showErrorToast(err, 'Failed to verify 2FA');
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
            showErrorToast(err, 'Failed to disable 2FA');
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
                            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3">
                                <Button variant="secondary" onClick={closeSetupModal} className="w-full sm:flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={verifyAndEnable} disabled={actionLoading} className="w-full sm:flex-1">
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
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3">
                        <Button variant="secondary" onClick={() => { setShowDisableModal(false); setError(null); setDisablePassword(''); }} className="w-full sm:flex-1">
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={disable2FA} disabled={actionLoading} className="w-full sm:flex-1">
                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable 2FA'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
