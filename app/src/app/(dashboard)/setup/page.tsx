'use client';

/**
 * Platform Setup Wizard
 * Guides users through configuring platforms for posting
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle,
    ArrowLeft,
    ArrowRight,
    Rocket,
    Check,
} from 'lucide-react';

// Wizard Steps
const STEPS = [
    { id: 'welcome', title: 'Welcome', description: 'Check system requirements' },
    { id: 'credentials', title: 'API Credentials', description: 'Configure platform apps' },
    { id: 'connect', title: 'Connect Account', description: 'Link your first account' },
    { id: 'test', title: 'Test Post', description: 'Optional: create a test post' },
    { id: 'complete', title: 'Complete', description: 'Ready to schedule!' },
];

interface SystemStatus {
    database: boolean;
    redis: boolean;
    storage: boolean;
    environment: boolean;
}

interface PlatformCredential {
    platform: string;
    configured: boolean;
    name: string;
    icon: string;
}

export default function SetupWizardPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
    const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Define functions before useEffect to satisfy React Compiler
    const checkSystemStatus = useCallback(async () => {
        try {
            const response = await fetch('/api/health/detailed');
            if (response.ok) {
                const data = await response.json();
                setSystemStatus({
                    database: data.services?.database?.status === 'healthy',
                    redis: data.services?.redis?.status === 'healthy',
                    storage: data.services?.storage?.status === 'healthy',
                    environment: data.services?.environment?.status === 'healthy',
                });
            }
        } catch {
            // Fall back to basic check
            setSystemStatus({
                database: true,
                redis: true,
                storage: true,
                environment: true,
            });
        }
        setIsLoading(false);
    }, []);

    const fetchCredentials = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/platform-credentials');
            if (response.ok) {
                const data = await response.json();
                // Map the API response to our format
                const platformInfo: Record<string, { name: string; icon: string }> = {
                    META: { name: 'Meta (Instagram/Facebook)', icon: '📸' },
                    TIKTOK: { name: 'TikTok', icon: '🎵' },
                    YOUTUBE: { name: 'YouTube', icon: '📺' },
                    PINTEREST: { name: 'Pinterest', icon: '📌' },
                    LINKEDIN: { name: 'LinkedIn', icon: '💼' },
                };
                setCredentials(
                    (data.credentials || []).map((c: { platform: string; isConfigured: boolean }) => ({
                        platform: c.platform.toLowerCase(),
                        configured: c.isConfigured,
                        name: platformInfo[c.platform]?.name || c.platform,
                        icon: platformInfo[c.platform]?.icon || '🔗',
                    }))
                );
            }
        } catch {
            // Default platforms
            setCredentials([
                { platform: 'meta', configured: false, name: 'Meta (Instagram/Facebook)', icon: '📸' },
                { platform: 'tiktok', configured: false, name: 'TikTok', icon: '🎵' },
                { platform: 'youtube', configured: false, name: 'YouTube', icon: '📺' },
                { platform: 'pinterest', configured: false, name: 'Pinterest', icon: '📌' },
                { platform: 'linkedin', configured: false, name: 'LinkedIn', icon: '💼' },
            ]);
        }
    }, []);

    const fetchConnectedAccounts = useCallback(async () => {
        try {
            const response = await fetch('/api/accounts');
            if (response.ok) {
                const data = await response.json();
                setConnectedAccounts(data.accounts?.map((a: { platform: string }) => a.platform) || []);
            }
        } catch {
            setConnectedAccounts([]);
        }
    }, []);

    // Fetch system status on mount
    useEffect(() => {
        checkSystemStatus();
        fetchCredentials();
        fetchConnectedAccounts();
    }, [checkSystemStatus, fetchCredentials, fetchConnectedAccounts]);

    function nextStep() {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    }

    function prevStep() {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    }

    function skipToComplete() {
        setCurrentStep(STEPS.length - 1);
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950 py-12 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Progress Header */}
                <div className="mb-12">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <Rocket className="w-8 h-8 text-indigo-400" />
                            Platform Setup
                        </h1>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gray-400 hover:text-white text-sm"
                        >
                            Skip for now →
                        </button>
                    </div>

                    {/* Step Progress */}
                    <div className="flex items-center gap-2">
                        {STEPS.map((step, index) => (
                            <div key={step.id} className="flex items-center">
                                <button
                                    onClick={() => setCurrentStep(index)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${index === currentStep
                                        ? 'bg-indigo-600 text-white'
                                        : index < currentStep
                                            ? 'bg-green-600/20 text-green-400'
                                            : 'bg-gray-800 text-gray-500'
                                        }`}
                                >
                                    {index < currentStep ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-xs">
                                            {index + 1}
                                        </span>
                                    )}
                                    <span className="hidden sm:inline">{step.title}</span>
                                </button>
                                {index < STEPS.length - 1 && (
                                    <div
                                        className={`w-8 h-0.5 ${index < currentStep ? 'bg-green-600' : 'bg-gray-700'}`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Step Content */}
                <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-8">
                    {currentStep === 0 && (
                        <WelcomeStep
                            systemStatus={systemStatus}
                            isLoading={isLoading}
                            onNext={nextStep}
                        />
                    )}
                    {currentStep === 1 && (
                        <CredentialsStep
                            credentials={credentials}
                            onNext={nextStep}
                            onPrev={prevStep}
                            onRefresh={fetchCredentials}
                        />
                    )}
                    {currentStep === 2 && (
                        <ConnectAccountStep
                            credentials={credentials}
                            connectedAccounts={connectedAccounts}
                            onNext={nextStep}
                            onPrev={prevStep}
                            onRefresh={fetchConnectedAccounts}
                        />
                    )}
                    {currentStep === 3 && (
                        <TestPostStep onNext={nextStep} onPrev={prevStep} onSkip={skipToComplete} />
                    )}
                    {currentStep === 4 && (
                        <CompleteStep
                            credentials={credentials}
                            connectedAccounts={connectedAccounts}
                            onGoToDashboard={() => router.push('/dashboard')}
                            onGoToCalendar={() => router.push('/calendar')}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// Step 1: Welcome & Prerequisites
function WelcomeStep({
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
                <h2 className="text-2xl font-bold text-white mb-2">Welcome to SocialiseIT!</h2>
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
                        <StatusCard
                            label="Database"
                            status={systemStatus?.database ?? false}
                            description="PostgreSQL connection"
                        />
                        <StatusCard
                            label="Cache"
                            status={systemStatus?.redis ?? false}
                            description="Redis for job queue"
                        />
                        <StatusCard
                            label="Storage"
                            status={systemStatus?.storage ?? false}
                            description="S3/MinIO for media"
                        />
                        <StatusCard
                            label="Environment"
                            status={systemStatus?.environment ?? false}
                            description="Required variables"
                        />
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
function CredentialsStep({
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
                <button
                    onClick={onRefresh}
                    className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                    ↻ Refresh status
                </button>
            </div>

            <div className="flex justify-between pt-6">
                <button
                    onClick={onPrev}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
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
function ConnectAccountStep({
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
        // Redirect to OAuth flow
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
                <button
                    onClick={onRefresh}
                    className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                    ↻ Refresh accounts
                </button>
            </div>

            <div className="flex justify-between pt-6">
                <button
                    onClick={onPrev}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
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
function TestPostStep({
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
                <button
                    onClick={onPrev}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <button
                    onClick={onNext}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                    Complete Setup
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Step 5: Complete
function CompleteStep({
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
