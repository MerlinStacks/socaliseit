/**
 * Setup Wizard Step Components
 * Includes CreateAdminStep for first-run, and credential helpers
 */

'use client';

import { useState } from 'react';
import { CheckCircle, ArrowLeft, ArrowRight, Check, ExternalLink, Copy, CheckCheck } from 'lucide-react';
import type { PlatformSetupInfo } from '@/lib/platform-setup-info';

// Types
export interface SystemStatus {
    database: boolean;
    redis: boolean;
    storage: boolean;
    environment: boolean;
}

export interface PlatformCredential {
    platform: string;
    configured: boolean;
    name: string;
    icon: string;
}

// Helper Component
function StatusCard({
    label,
    status,
    description,
}: {
    label: string;
    status: boolean;
    description: string;
}) {
    return (
        <div
            className={`p-4 rounded-lg border ${status ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'
                }`}
        >
            <div className="flex items-center gap-2 mb-1">
                {status ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                    <span className="w-5 h-5 rounded-full bg-red-500" />
                )}
                <span className="font-medium text-white">{label}</span>
            </div>
            <p className="text-sm text-gray-400">{description}</p>
        </div>
    );
}

// Step 0: Create Admin Account (first-run only)
export function CreateAdminStep({
    onComplete,
}: {
    onComplete: () => void;
}) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);
        try {
            // Create the account
            const regRes = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });
            const regData = await regRes.json();
            if (!regRes.ok) {
                setError(regData.error || 'Failed to create account');
                return;
            }

            // Auto-sign in via NextAuth credentials
            const { signIn } = await import('next-auth/react');
            const signInRes = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (signInRes?.error) {
                setError('Account created but auto-login failed. Please sign in manually.');
                return;
            }

            onComplete();
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600/20 rounded-full mb-4">
                    <span className="text-3xl">👤</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Create Admin Account</h2>
                <p className="text-gray-400">
                    This will be the owner account with full platform access.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
                {error && (
                    <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                <div>
                    <label htmlFor="setup-name" className="block text-sm font-medium text-gray-300 mb-1">Full name</label>
                    <input
                        id="setup-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="Jane Smith"
                    />
                </div>

                <div>
                    <label htmlFor="setup-email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                    <input
                        id="setup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="you@example.com"
                    />
                </div>

                <div>
                    <label htmlFor="setup-password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                    <input
                        id="setup-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="••••••••"
                    />
                    <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
                </div>

                <div>
                    <label htmlFor="setup-confirm" className="block text-sm font-medium text-gray-300 mb-1">Confirm password</label>
                    <input
                        id="setup-confirm"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="••••••••"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    {isLoading ? (
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                        <>
                            Create Account & Continue
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}

// Troubleshooting hints for unhealthy services
const TROUBLESHOOTING: Record<string, string> = {
    database: 'Check that PostgreSQL is running and DATABASE_URL is correct',
    redis: 'Check that Redis is running and REDIS_URL is correct',
    storage: 'MinIO/S3 not reachable — media uploads may not work until fixed',
    environment: 'Check docker-compose environment section for missing variables',
};

// Step 1: Welcome & Prerequisites
export function WelcomeStep({
    systemStatus,
    isLoading,
    onNext,
}: {
    systemStatus: SystemStatus | null;
    isLoading: boolean;
    onNext: () => void;
}) {
    const allHealthy = systemStatus
        ? Object.values(systemStatus).every((v) => v)
        : false;

    const unhealthyServices = systemStatus
        ? Object.entries(systemStatus).filter(([, v]) => !v).map(([k]) => k)
        : [];

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Welcome to Overseek Socials!</h2>
                <p className="text-gray-400">
                    Let&apos;s get your platform ready for scheduling and posting content.
                </p>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">System Status</h3>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <StatusCard label="Database" status={systemStatus?.database ?? false} description="PostgreSQL connection" />
                            <StatusCard label="Cache" status={systemStatus?.redis ?? false} description="Redis for job queue" />
                            <StatusCard label="Storage" status={systemStatus?.storage ?? false} description="S3/MinIO for media" />
                            <StatusCard label="Environment" status={systemStatus?.environment ?? false} description="Required variables" />
                        </div>

                        {unhealthyServices.length > 0 && (
                            <div className="mt-4 rounded-lg bg-amber-900/20 border border-amber-800 p-4">
                                <h4 className="text-sm font-medium text-amber-400 mb-2">Troubleshooting</h4>
                                <ul className="space-y-1">
                                    {unhealthyServices.map((svc) => (
                                        <li key={svc} className="text-sm text-amber-300/80">
                                            • <span className="font-medium capitalize">{svc}</span>: {TROUBLESHOOTING[svc] || 'Check service logs'}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex justify-end pt-6">
                <button
                    onClick={onNext}
                    disabled={!allHealthy && !isLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Copy-to-clipboard helper
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            title="Copy to clipboard"
        >
            {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
        </button>
    );
}

// Step 2: Credentials Configuration
export function CredentialsStep({
    credentials,
    platformSetupInfo,
    onNext,
    onPrev,
    onRefresh,
}: {
    credentials: PlatformCredential[];
    platformSetupInfo?: PlatformSetupInfo[];
    onNext: () => void;
    onPrev: () => void;
    onRefresh: () => void;
}) {
    const hasAnyCredentials = credentials.some((c) => c.configured);
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

    function getSetupInfo(platform: string) {
        return platformSetupInfo?.find((p) => p.platform === platform.toLowerCase());
    }

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Configure Platform APIs</h2>
                <p className="text-gray-400">
                    Set up your developer app credentials for each platform you want to use.
                </p>
            </div>

            <div className="grid gap-4">
                {credentials.map((cred) => {
                    const info = getSetupInfo(cred.platform);
                    const isExpanded = expandedPlatform === cred.platform;

                    return (
                        <div
                            key={cred.platform}
                            className={`rounded-lg border overflow-hidden ${cred.configured
                                ? 'bg-green-900/20 border-green-800'
                                : 'bg-gray-800/50 border-gray-700'
                                }`}
                        >
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{cred.icon}</span>
                                    <div>
                                        <p className="font-medium text-white">{cred.name}</p>
                                        <p className="text-sm text-gray-400">
                                            {cred.configured ? 'Credentials configured' : 'Not configured'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {cred.configured ? (
                                        <CheckCircle className="w-6 h-6 text-green-400" />
                                    ) : (
                                        <>
                                            {info && (
                                                <button
                                                    onClick={() => setExpandedPlatform(isExpanded ? null : cred.platform)}
                                                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                                                >
                                                    {isExpanded ? 'Hide guide' : 'Setup guide'}
                                                </button>
                                            )}
                                            <a
                                                href={`/settings?tab=credentials&platform=${cred.platform}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                                            >
                                                Configure
                                            </a>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Expanded setup guide */}
                            {isExpanded && info && (
                                <div className="border-t border-gray-700 bg-gray-900/50 p-4 space-y-3">
                                    <a
                                        href={info.devPortalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Open {info.devPortalLabel}
                                    </a>

                                    <div>
                                        <p className="text-xs font-medium text-gray-400 mb-1">Redirect URI (paste this in the developer portal):</p>
                                        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                                            <code className="text-xs text-green-400 flex-1 break-all">{info.redirectUriPath}</code>
                                            <CopyButton text={info.redirectUriPath} />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-medium text-gray-400 mb-1">Quick steps:</p>
                                        <ol className="space-y-1">
                                            {info.setupHints.map((hint, i) => (
                                                <li key={i} className="text-xs text-gray-300">
                                                    {i + 1}. {hint}
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center justify-center pt-4">
                <button onClick={onRefresh} className="text-indigo-400 hover:text-indigo-300 text-sm">
                    ↻ Refresh status
                </button>
            </div>

            <div className="flex justify-between pt-6">
                <button onClick={onPrev} className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={!hasAnyCredentials}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    {hasAnyCredentials ? 'Continue' : 'Configure at least one platform'}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Step 3: Connect Social Accounts
export function ConnectAccountStep({
    credentials,
    connectedAccounts,
    onNext,
    onPrev,
    onRefresh,
}: {
    credentials: PlatformCredential[];
    connectedAccounts: string[];
    onNext: () => void;
    onPrev: () => void;
    onRefresh: () => void;
}) {
    const configuredPlatforms = credentials.filter((c) => c.configured);
    const hasConnectedAccounts = connectedAccounts.length > 0;

    function connectPlatform(platform: string) {
        window.location.href = `/api/accounts/connect/${platform}`;
    }

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Connect Your Accounts</h2>
                <p className="text-gray-400">
                    Connect your social media accounts to start scheduling posts.
                </p>
            </div>

            {configuredPlatforms.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-gray-400">No platforms configured yet. Go back to set up credentials first.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {configuredPlatforms.map((cred) => {
                        const isConnected = connectedAccounts.some(
                            (a) => a.toLowerCase() === cred.platform.toLowerCase()
                        );

                        return (
                            <div
                                key={cred.platform}
                                className={`flex items-center justify-between p-4 rounded-lg border ${isConnected
                                    ? 'bg-green-900/20 border-green-800'
                                    : 'bg-gray-800/50 border-gray-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{cred.icon}</span>
                                    <div>
                                        <p className="font-medium text-white">{cred.name}</p>
                                        <p className="text-sm text-gray-400">
                                            {isConnected ? 'Connected' : 'Not connected'}
                                        </p>
                                    </div>
                                </div>
                                {isConnected ? (
                                    <CheckCircle className="w-6 h-6 text-green-400" />
                                ) : (
                                    <button
                                        onClick={() => connectPlatform(cred.platform)}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                                    >
                                        Connect
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center justify-center pt-4">
                <button onClick={onRefresh} className="text-indigo-400 hover:text-indigo-300 text-sm">
                    ↻ Refresh accounts
                </button>
            </div>

            <div className="flex justify-between pt-6">
                <button onClick={onPrev} className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={!hasConnectedAccounts}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    {hasConnectedAccounts ? 'Continue' : 'Connect at least one account'}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Step 4: Test Post (optional)
export function TestPostStep({
    onNext,
    onPrev,
    onSkip,
}: {
    onNext: () => void;
    onPrev: () => void;
    onSkip: () => void;
}) {
    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Create a Test Post</h2>
                <p className="text-gray-400">
                    Optional: create a quick test post to verify everything is working.
                </p>
            </div>

            <div className="flex flex-col items-center gap-4 py-8">
                <a
                    href="/compose"
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors inline-flex items-center gap-2"
                >
                    Open Compose
                    <ArrowRight className="w-4 h-4" />
                </a>
                <button onClick={onSkip} className="text-gray-400 hover:text-white text-sm">
                    Skip this step
                </button>
            </div>

            <div className="flex justify-between pt-6">
                <button onClick={onPrev} className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <button
                    onClick={onNext}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Step 5: Setup Complete
export function CompleteStep({
    credentials,
    connectedAccounts,
    onGoToDashboard,
    onGoToCalendar,
}: {
    credentials: PlatformCredential[];
    connectedAccounts: string[];
    onGoToDashboard: () => void;
    onGoToCalendar: () => void;
}) {
    const configuredCount = credentials.filter((c) => c.configured).length;

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600/20 rounded-full mb-4">
                    <Check className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
                <p className="text-gray-400">
                    Your platform is configured and ready to use.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700 text-center">
                    <p className="text-2xl font-bold text-indigo-400">{configuredCount}</p>
                    <p className="text-sm text-gray-400">Platforms configured</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700 text-center">
                    <p className="text-2xl font-bold text-green-400">{connectedAccounts.length}</p>
                    <p className="text-sm text-gray-400">Accounts connected</p>
                </div>
            </div>

            <div className="flex flex-col items-center gap-3 pt-8">
                <button
                    onClick={onGoToDashboard}
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                    Go to Dashboard
                </button>
                <button
                    onClick={onGoToCalendar}
                    className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                    Open Calendar →
                </button>
            </div>
        </div>
    );
}
