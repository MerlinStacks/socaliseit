'use client';

/**
 * Two-Factor Authentication Enrollment Wizard
 * Step-by-step 2FA setup with QR code and backup codes
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from '@/components/ui/toast';
import {
    Shield,
    Smartphone,
    KeyRound,
    Check,
    Copy,
    Download,
    QrCode,
    AlertTriangle,
    ChevronRight,
    ChevronLeft
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface TwoFactorSetupResponse {
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
}

interface TwoFactorWizardProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

type WizardStep = 'intro' | 'scan' | 'verify' | 'backup' | 'complete';

// ============================================================================
// Step Components
// ============================================================================

function IntroStep({ onNext }: { onNext: () => void }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent-gold)] to-[var(--accent-pink)] flex items-center justify-center">
                    <Shield className="w-10 h-10 text-white" />
                </div>
            </div>

            <div className="text-center">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Secure your account with 2FA
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                    Two-factor authentication adds an extra layer of security by requiring
                    a code from your phone in addition to your password.
                </p>
            </div>

            <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                    <Smartphone className="w-5 h-5 text-[var(--accent-gold)] mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                            Download an authenticator app
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                            Google Authenticator, Authy, or 1Password work great
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                    <QrCode className="w-5 h-5 text-[var(--accent-gold)] mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                            Scan a QR code
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                            We&apos;ll show you a QR code to add to your app
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
                    <KeyRound className="w-5 h-5 text-[var(--accent-gold)] mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                            Save backup codes
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                            We&apos;ll give you recovery codes in case you lose your phone
                        </p>
                    </div>
                </div>
            </div>

            <Button onClick={onNext} className="w-full btn-interactive">
                Get Started
                <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
        </div>
    );
}

function ScanStep({
    qrCodeUrl,
    secret,
    onNext,
    onBack
}: {
    qrCodeUrl: string;
    secret: string;
    onNext: () => void;
    onBack: () => void;
}) {
    const [copied, setCopied] = useState(false);

    const copySecret = useCallback(async () => {
        await navigator.clipboard.writeText(secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [secret]);

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Scan QR Code
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Open your authenticator app and scan this code
                </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center p-6 bg-white rounded-xl">
                {qrCodeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={qrCodeUrl}
                        alt="2FA QR Code"
                        className="w-48 h-48"
                    />
                ) : (
                    <div className="w-48 h-48 flex items-center justify-center bg-[var(--bg-tertiary)] rounded">
                        <LoadingSpinner variant="branded" />
                    </div>
                )}
            </div>

            {/* Manual Entry */}
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)]">
                <p className="text-xs text-[var(--text-muted)] mb-2">
                    Can&apos;t scan? Enter this code manually:
                </p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] px-3 py-2 rounded">
                        {secret}
                    </code>
                    <Button variant="ghost" size="sm" onClick={copySecret}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            <div className="flex gap-3">
                <Button variant="secondary" onClick={onBack} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <Button onClick={onNext} className="flex-1 btn-interactive">
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
            </div>
        </div>
    );
}

function VerifyStep({
    onVerify,
    onBack,
    isPending
}: {
    onVerify: (code: string) => void;
    onBack: () => void;
    isPending: boolean;
}) {
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) {
            setError('Please enter a 6-digit code');
            return;
        }
        setError(null);
        onVerify(code);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Verify Setup
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Enter the 6-digit code from your authenticator app
                </p>
            </div>

            <div>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className={cn(
                        'w-full text-center text-3xl font-mono tracking-[0.5em] py-4',
                        'bg-[var(--bg-tertiary)] border rounded-lg',
                        error ? 'border-[var(--error)]' : 'border-[var(--border)]',
                        'focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]'
                    )}
                    autoFocus
                />
                {error && (
                    <p className="text-sm text-[var(--error)] mt-2 text-center">{error}</p>
                )}
            </div>

            <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <Button type="submit" disabled={isPending} className="flex-1 btn-interactive">
                    {isPending ? <LoadingSpinner size="sm" /> : 'Verify'}
                </Button>
            </div>
        </form>
    );
}

function BackupCodesStep({
    backupCodes,
    onNext
}: {
    backupCodes: string[];
    onNext: () => void;
}) {
    const [downloaded, setDownloaded] = useState(false);
    const [copied, setCopied] = useState(false);

    const downloadCodes = useCallback(() => {
        const content = `SocialiseIT Backup Codes\n${'='.repeat(30)}\n\nKeep these codes safe. Each code can only be used once.\n\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nGenerated: ${new Date().toISOString()}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'socialiseit-backup-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
        setDownloaded(true);
    }, [backupCodes]);

    const copyCodes = useCallback(async () => {
        await navigator.clipboard.writeText(backupCodes.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [backupCodes]);

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Save Backup Codes
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Store these codes securely. You&apos;ll need them if you lose access to your authenticator app.
                </p>
            </div>

            <div className="p-4 rounded-lg bg-[var(--warning-light)] border border-[var(--warning)]">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-[var(--warning)] shrink-0" />
                    <p className="text-sm text-[var(--text-primary)]">
                        <strong>Important:</strong> Each backup code can only be used once.
                        Keep them somewhere safe!
                    </p>
                </div>
            </div>

            {/* Backup Codes Grid */}
            <div className="grid grid-cols-2 gap-2 p-4 bg-[var(--bg-tertiary)] rounded-lg font-mono text-sm">
                {backupCodes.map((code, i) => (
                    <div key={i} className="px-3 py-2 bg-[var(--bg-secondary)] rounded text-center">
                        {code}
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <Button variant="secondary" onClick={downloadCodes} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    {downloaded ? 'Downloaded!' : 'Download'}
                </Button>
                <Button variant="secondary" onClick={copyCodes} className="flex-1">
                    {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copied ? 'Copied!' : 'Copy'}
                </Button>
            </div>

            <Button
                onClick={onNext}
                disabled={!downloaded && !copied}
                className="w-full btn-interactive"
            >
                I&apos;ve saved my codes
                <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
        </div>
    );
}

function CompleteStep({ onClose }: { onClose: () => void }) {
    return (
        <div className="space-y-6 text-center">
            <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-[var(--success-light)] flex items-center justify-center">
                    <Check className="w-10 h-10 text-[var(--success)]" />
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Two-factor authentication enabled!
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                    Your account is now protected with an extra layer of security.
                    You&apos;ll need to enter a code from your authenticator app when signing in.
                </p>
            </div>

            <Button onClick={onClose} className="w-full btn-interactive">
                Done
            </Button>
        </div>
    );
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export function TwoFactorWizard({ open, onClose, onSuccess }: TwoFactorWizardProps) {
    const [step, setStep] = useState<WizardStep>('intro');
    const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);

    // Initialize 2FA setup
    const initSetup = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to initialize 2FA');
            return res.json() as Promise<TwoFactorSetupResponse>;
        },
        onSuccess: (data) => {
            setSetupData(data);
            setStep('scan');
        },
        onError: () => {
            toast('error', 'Failed to initialize 2FA setup');
        },
    });

    // Verify 2FA code
    const verifyCode = useMutation({
        mutationFn: async (code: string) => {
            const res = await fetch('/api/auth/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Invalid code');
            }
            return res.json();
        },
        onSuccess: () => {
            setStep('backup');
        },
        onError: (err: Error) => {
            toast('error', err.message || 'Invalid verification code');
        },
    });

    const handleClose = () => {
        setStep('intro');
        setSetupData(null);
        onClose();
    };

    const handleComplete = () => {
        onSuccess?.();
        handleClose();
    };

    const handleStartSetup = () => {
        initSetup.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="sr-only">
                        Set up two-factor authentication
                    </DialogTitle>
                </DialogHeader>

                {/* Progress Indicator */}
                {step !== 'intro' && step !== 'complete' && (
                    <div className="flex gap-1 mb-4">
                        {['scan', 'verify', 'backup'].map((s, i) => (
                            <div
                                key={s}
                                className={cn(
                                    'h-1 flex-1 rounded-full transition-colors',
                                    ['scan', 'verify', 'backup'].indexOf(step) >= i
                                        ? 'bg-[var(--accent-gold)]'
                                        : 'bg-[var(--border)]'
                                )}
                            />
                        ))}
                    </div>
                )}

                {/* Loading State */}
                {initSetup.isPending && (
                    <div className="py-12 flex flex-col items-center gap-4">
                        <LoadingSpinner variant="branded" size="lg" />
                        <p className="text-sm text-[var(--text-secondary)]">
                            Generating secure keys...
                        </p>
                    </div>
                )}

                {/* Steps */}
                {!initSetup.isPending && (
                    <>
                        {step === 'intro' && <IntroStep onNext={handleStartSetup} />}

                        {step === 'scan' && setupData && (
                            <ScanStep
                                qrCodeUrl={setupData.qrCodeUrl}
                                secret={setupData.secret}
                                onNext={() => setStep('verify')}
                                onBack={() => setStep('intro')}
                            />
                        )}

                        {step === 'verify' && (
                            <VerifyStep
                                onVerify={(code) => verifyCode.mutate(code)}
                                onBack={() => setStep('scan')}
                                isPending={verifyCode.isPending}
                            />
                        )}

                        {step === 'backup' && setupData && (
                            <BackupCodesStep
                                backupCodes={setupData.backupCodes}
                                onNext={() => setStep('complete')}
                            />
                        )}

                        {step === 'complete' && <CompleteStep onClose={handleComplete} />}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
