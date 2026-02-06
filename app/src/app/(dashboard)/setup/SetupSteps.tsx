/**
 * Setup Wizard Step Components
 * Extracted from page.tsx for 200-line standard compliance
 */

'use client';

import { CheckCircle, ArrowLeft, ArrowRight, Check } from 'lucide-react';

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
                    <div className="grid grid-cols-2 gap-4">
                        <StatusCard label="Database" status={systemStatus?.database ?? false} description="PostgreSQL connection" />
                        <StatusCard label="Cache" status={systemStatus?.redis ?? false} description="Redis for job queue" />
                        <StatusCard label="Storage" status={systemStatus?.storage ?? false} description="S3/MinIO for media" />
                        <StatusCard label="Environment" status={systemStatus?.environment ?? false} description="Required variables" />
                    </div>
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

// Step 2: Credentials Configuration
export function CredentialsStep({
    credentials,
    onNext,
    onPrev,
    onRefresh,
}: {
    credentials: PlatformCredential[];
    onNext: () => void;
    onPrev: () => void;
    onRefresh: () => void;
}) {
    const hasAnyCredentials = credentials.some((c) => c.configured);

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Configure Platform APIs</h2>
                <p className="text-gray-400">
                    Set up your developer app credentials for each platform you want to use.
                </p>
            </div>

            <div className="grid gap-4">
                {credentials.map((cred) => (
                    <div
                        key={cred.platform}
                        className={`flex items-center justify-between p-4 rounded-lg border ${cred.configured
                            ? 'bg-green-900/20 border-green-800'
                            : 'bg-gray-800/50 border-gray-700'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{cred.icon}</span>
                            <div>
                                <p className="font-medium text-white">{cred.name}</p>
                                <p className="text-sm text-gray-400">
                                    {cred.configured ? 'Credentials configured' : 'Not configured'}
                                </p>
                            </div>
                        </div>
                        {cred.configured ? (
                            <CheckCircle className="w-6 h-6 text-green-400" />
                        ) : (
                            <a
                                href={`/settings?tab=credentials&platform=${cred.platform}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                            >
                                Configure
                            </a>
                        )}
                    </div>
                ))}
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

// Step 3: Connect Account
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
    const hasConnectedAccount = connectedAccounts.length > 0;

    function connectPlatform(platform: string) {
        window.location.href = `/api/accounts/connect/${platform}`;
    }

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Connect Your Account</h2>
                <p className="text-gray-400">
                    Link your social media accounts to start scheduling content.
                </p>
            </div>

            {configuredPlatforms.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                    <p>No platforms configured. Please go back and configure at least one platform.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {configuredPlatforms.map((cred) => {
                        const isConnected = connectedAccounts.includes(cred.platform.toUpperCase());
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
                    disabled={!hasConnectedAccount}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    {hasConnectedAccount ? 'Continue' : 'Connect at least one account'}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Step 4: Test Post (Optional)
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
                    Optional: Create a test post to verify everything is working correctly.
                </p>
            </div>

            <div className="flex flex-col items-center gap-6 py-8">
                <div className="text-6xl">📝</div>
                <p className="text-gray-400 text-center max-w-md">
                    You can skip this step and create your first post later from the Compose page.
                </p>

                <div className="flex gap-4">
                    <a
                        href="/compose"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                        Open Composer
                    </a>
                    <button
                        onClick={onSkip}
                        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        Skip this step
                    </button>
                </div>
            </div>

            <div className="flex justify-between pt-6">
                <button onClick={onPrev} className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <button onClick={onNext} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                    Complete Setup
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Step 5: Complete
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
    const connectedCount = connectedAccounts.length;

    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-600/20 rounded-full mb-4">
                    <Check className="w-12 h-12 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Setup Complete! 🎉</h2>
                <p className="text-gray-400">
                    Your platform is ready to schedule and publish content.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-indigo-400">{configuredCount}</p>
                    <p className="text-sm text-gray-400">Platforms configured</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-green-400">{connectedCount}</p>
                    <p className="text-sm text-gray-400">Accounts connected</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                <button
                    onClick={onGoToCalendar}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                    📅 Go to Calendar
                </button>
                <button
                    onClick={onGoToDashboard}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                    🏠 Go to Dashboard
                </button>
            </div>

            <div className="text-center pt-4">
                <a href="/status" className="text-indigo-400 hover:text-indigo-300 text-sm">
                    View System Health Dashboard →
                </a>
            </div>
        </div>
    );
}
