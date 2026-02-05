'use client';

/**
 * Platform Setup Wizard
 * Guides users through configuring platforms for posting
 * 
 * Decomposed for 200-line standard compliance - step components in SetupSteps.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Check } from 'lucide-react';
import {
    WelcomeStep,
    CredentialsStep,
    ConnectAccountStep,
    TestPostStep,
    CompleteStep,
    type SystemStatus,
    type PlatformCredential,
} from './SetupSteps';

// Wizard Steps
const STEPS = [
    { id: 'welcome', title: 'Welcome', description: 'Check system requirements' },
    { id: 'credentials', title: 'API Credentials', description: 'Configure platform apps' },
    { id: 'connect', title: 'Connect Account', description: 'Link your first account' },
    { id: 'test', title: 'Test Post', description: 'Optional: create a test post' },
    { id: 'complete', title: 'Complete', description: 'Ready to schedule!' },
];

export default function SetupWizardPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
    const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
            setSystemStatus({ database: true, redis: true, storage: true, environment: true });
        }
        setIsLoading(false);
    }, []);

    const fetchCredentials = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/platform-credentials');
            if (response.ok) {
                const data = await response.json();
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

    useEffect(() => {
        checkSystemStatus();
        fetchCredentials();
        fetchConnectedAccounts();
    }, [checkSystemStatus, fetchCredentials, fetchConnectedAccounts]);

    const nextStep = () => currentStep < STEPS.length - 1 && setCurrentStep(currentStep + 1);
    const prevStep = () => currentStep > 0 && setCurrentStep(currentStep - 1);
    const skipToComplete = () => setCurrentStep(STEPS.length - 1);

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
                                    <div className={`w-8 h-0.5 ${index < currentStep ? 'bg-green-600' : 'bg-gray-700'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Step Content */}
                <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-8">
                    {currentStep === 0 && (
                        <WelcomeStep systemStatus={systemStatus} isLoading={isLoading} onNext={nextStep} />
                    )}
                    {currentStep === 1 && (
                        <CredentialsStep credentials={credentials} onNext={nextStep} onPrev={prevStep} onRefresh={fetchCredentials} />
                    )}
                    {currentStep === 2 && (
                        <ConnectAccountStep credentials={credentials} connectedAccounts={connectedAccounts} onNext={nextStep} onPrev={prevStep} onRefresh={fetchConnectedAccounts} />
                    )}
                    {currentStep === 3 && (
                        <TestPostStep onNext={nextStep} onPrev={prevStep} onSkip={skipToComplete} />
                    )}
                    {currentStep === 4 && (
                        <CompleteStep credentials={credentials} connectedAccounts={connectedAccounts} onGoToDashboard={() => router.push('/dashboard')} onGoToCalendar={() => router.push('/calendar')} />
                    )}
                </div>
            </div>
        </div>
    );
}
