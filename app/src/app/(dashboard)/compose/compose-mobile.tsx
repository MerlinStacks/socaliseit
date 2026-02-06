/**
 * Mobile Compose Stepper
 * Simplified 4-step compose workflow for mobile devices
 * Steps: Select Accounts → Create Content → Customize → Preview & Schedule
 */

'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, Users, Edit3, Settings, Eye, Trash2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/hooks/use-haptic';
import type { SocialAccount } from '@/components/compose/profile-selector';
import type { MediaItem } from '@/components/compose/platform-editor';

const STEPS = [
    { id: 0, label: 'Accounts', icon: Users },
    { id: 1, label: 'Content', icon: Edit3 },
    { id: 2, label: 'Customize', icon: Settings },
    { id: 3, label: 'Preview', icon: Eye },
] as const;

interface ComposeMobileProps {
    // Account state
    accounts: SocialAccount[];
    selectedAccountIds: string[];
    onAccountToggle: (accountId: string) => void;
    isLoadingAccounts: boolean;

    // Content state
    caption: string;
    onCaptionChange: (caption: string) => void;
    media: MediaItem[];
    onAddMedia: () => void;

    // Scheduling state
    selectedDate: Date;
    selectedTime: string;
    onOpenScheduleModal: () => void;

    // Actions
    onSave: () => void;
    onSchedule: () => void;
    onPublish: () => void;
    onDiscardDraft: () => void;
    isSaving: boolean;
    isScheduling: boolean;
    isPublishing: boolean;

    // AI & Templates
    onAIAssist: () => void;
    onOpenTemplates: () => void;

    // Preview platforms
    uniquePlatforms: string[];

    // Post status (optional for status-aware UI)
    editPostStatus?: string | null;
    isPostPublishing?: boolean;
    isStuckPublishing?: boolean;
    isPostFailed?: boolean;
    isRetrying?: boolean;
    onRetryPublish?: () => void;
}

export function ComposeMobile({
    accounts,
    selectedAccountIds,
    onAccountToggle,
    isLoadingAccounts,
    caption,
    onCaptionChange,
    media,
    onAddMedia,
    selectedDate,
    selectedTime,
    onOpenScheduleModal,
    onSave,
    onSchedule,
    onPublish,
    onDiscardDraft,
    isSaving,
    isScheduling,
    isPublishing,
    onAIAssist,
    onOpenTemplates,
    uniquePlatforms,
    // Status props
    isPostPublishing = false,
    isStuckPublishing = false,
    isPostFailed = false,
    isRetrying = false,
    onRetryPublish,
}: ComposeMobileProps) {
    const [currentStep, setCurrentStep] = useState(0);

    const isSubmitting = isSaving || isScheduling || isPublishing || isRetrying;
    const hasSelectedAccounts = selectedAccountIds.length > 0;
    const hasContent = caption.trim().length > 0 || media.length > 0;

    const canProceed = () => {
        switch (currentStep) {
            case 0:
                return hasSelectedAccounts;
            case 1:
                return hasContent;
            case 2:
                return true; // Customize is optional
            case 3:
                return true;
            default:
                return false;
        }
    };

    const handleNext = useCallback(() => {
        if (currentStep < STEPS.length - 1 && canProceed()) {
            triggerHaptic('light');
            setCurrentStep(prev => prev + 1);
        }
    }, [currentStep]);

    const handlePrev = useCallback(() => {
        if (currentStep > 0) {
            triggerHaptic('light');
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const handleStepClick = useCallback((stepId: number) => {
        // Only allow going to previously completed steps or current+1
        if (stepId <= currentStep || (stepId === currentStep + 1 && canProceed())) {
            triggerHaptic('light');
            setCurrentStep(stepId);
        }
    }, [currentStep]);

    return (
        <div className="flex h-full flex-col bg-[var(--bg-primary)]">
            {/* Step Progress Header */}
            <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex items-center justify-between">
                    {STEPS.map((step, idx) => {
                        const Icon = step.icon;
                        const isActive = idx === currentStep;
                        const isCompleted = idx < currentStep;
                        const isClickable = idx <= currentStep || (idx === currentStep + 1 && canProceed());

                        return (
                            <button
                                key={step.id}
                                onClick={() => isClickable && handleStepClick(idx)}
                                disabled={!isClickable}
                                className={cn(
                                    'flex flex-col items-center gap-1 transition-colors',
                                    isActive && 'text-[var(--accent-gold)]',
                                    isCompleted && 'text-green-500',
                                    !isActive && !isCompleted && 'text-[var(--text-muted)]',
                                    !isClickable && 'opacity-50'
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                                        isActive && 'bg-[var(--accent-gold)]/20',
                                        isCompleted && 'bg-green-500/20'
                                    )}
                                >
                                    {isCompleted ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Icon className="h-4 w-4" />
                                    )}
                                </div>
                                <span className="text-[10px] font-medium">{step.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1 rounded-full bg-[var(--bg-tertiary)]">
                    <div
                        className="h-full rounded-full bg-gradient transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Status Banners for PUBLISHING/FAILED posts */}
            {isPostPublishing && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
                    <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        <span className="text-sm font-medium text-amber-500">
                            {isStuckPublishing ? 'Publishing stuck' : 'Publishing...'}
                        </span>
                    </div>
                    {isStuckPublishing && onRetryPublish && (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={onRetryPublish}
                            disabled={isRetrying}
                            className="bg-amber-500/20 text-amber-500 text-xs py-1 px-2 h-auto"
                        >
                            {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                    )}
                </div>
            )}
            {isPostFailed && (
                <div className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-4 py-2">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium text-red-500">Publishing failed</span>
                    </div>
                    {onRetryPublish && (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={onRetryPublish}
                            disabled={isRetrying}
                            className="bg-red-500/20 text-red-500 text-xs py-1 px-2 h-auto"
                        >
                            {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                    )}
                </div>
            )}

            {/* Step Content */}
            <div className="flex-1 overflow-auto">
                {/* Step 0: Select Accounts */}
                {currentStep === 0 && (
                    <div className="p-4">
                        <h2 className="mb-4 text-lg font-semibold">Select Accounts</h2>
                        <p className="mb-4 text-sm text-[var(--text-muted)]">
                            Choose which accounts to post to
                        </p>

                        {isLoadingAccounts ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
                                ))}
                            </div>
                        ) : accounts.length === 0 ? (
                            <div className="rounded-lg border border-[var(--border)] p-6 text-center">
                                <p className="text-[var(--text-muted)]">No accounts connected</p>
                                <Button className="mt-3" onClick={() => window.location.href = '/settings/accounts'}>
                                    Connect Accounts
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {accounts.map(account => {
                                    const isSelected = selectedAccountIds.includes(account.id);
                                    return (
                                        <button
                                            key={account.id}
                                            onClick={() => {
                                                triggerHaptic('light');
                                                onAccountToggle(account.id);
                                            }}
                                            className={cn(
                                                'flex w-full items-center gap-3 rounded-lg border p-3 transition-colors',
                                                isSelected
                                                    ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]/10'
                                                    : 'border-[var(--border)] bg-[var(--bg-secondary)]'
                                            )}
                                        >
                                            {account.avatar ? (
                                                <img
                                                    src={account.avatar}
                                                    alt={account.name || account.platform}
                                                    className="h-10 w-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-lg">
                                                    {(account.name || account.platform)[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex-1 text-left">
                                                <p className="font-medium">{account.name || `${account.platform} Account`}</p>
                                                <p className="text-xs capitalize text-[var(--text-muted)]">{account.platform}</p>
                                            </div>
                                            <div
                                                className={cn(
                                                    'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
                                                    isSelected
                                                        ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]'
                                                        : 'border-[var(--border)]'
                                                )}
                                            >
                                                {isSelected && <Check className="h-3 w-3 text-white" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 1: Create Content */}
                {currentStep === 1 && (
                    <div className="flex h-full flex-col p-4">
                        <h2 className="mb-4 text-lg font-semibold">Create Content</h2>

                        {/* Media Section */}
                        <div className="mb-4">
                            <button
                                onClick={() => {
                                    triggerHaptic('light');
                                    onAddMedia();
                                }}
                                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-[var(--text-muted)] transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                            >
                                {media.length > 0 ? (
                                    <div className="flex gap-2">
                                        {media.slice(0, 3).map((item, idx) => (
                                            <div key={idx} className="h-16 w-16 rounded overflow-hidden">
                                                {item.type === 'image' ? (
                                                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <video src={item.url} className="h-full w-full object-cover" />
                                                )}
                                            </div>
                                        ))}
                                        {media.length > 3 && (
                                            <div className="flex h-16 w-16 items-center justify-center rounded bg-[var(--bg-tertiary)]">
                                                +{media.length - 3}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Photos or Videos
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Caption */}
                        <div className="flex-1">
                            <textarea
                                value={caption}
                                onChange={(e) => onCaptionChange(e.target.value)}
                                placeholder="Write your caption..."
                                className="h-full min-h-[150px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm focus:border-[var(--accent-gold)] focus:outline-none"
                            />
                        </div>

                        {/* Quick Actions */}
                        <div className="mt-3 flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    triggerHaptic('light');
                                    onAIAssist();
                                }}
                            >
                                ✨ AI Assist
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    triggerHaptic('light');
                                    onOpenTemplates();
                                }}
                            >
                                📄 Templates
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 2: Customize (Placeholder) */}
                {currentStep === 2 && (
                    <div className="p-4">
                        <h2 className="mb-4 text-lg font-semibold">Customize</h2>
                        <p className="mb-4 text-sm text-[var(--text-muted)]">
                            Platform-specific settings (coming soon)
                        </p>

                        <div className="space-y-3">
                            {uniquePlatforms.map(platform => (
                                <div
                                    key={platform}
                                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                                            {platform[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium capitalize">{platform}</p>
                                            <p className="text-xs text-[var(--text-muted)]">Using default settings</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 3: Preview & Schedule */}
                {currentStep === 3 && (
                    <div className="p-4">
                        <h2 className="mb-4 text-lg font-semibold">Preview & Schedule</h2>

                        {/* Preview Card */}
                        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            {media.length > 0 && (
                                <div className="mb-3 aspect-square w-full overflow-hidden rounded-lg">
                                    {media[0].type === 'image' ? (
                                        <img src={media[0].url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <video src={media[0].url} className="h-full w-full object-cover" controls />
                                    )}
                                </div>
                            )}
                            <p className="text-sm">{caption || 'No caption'}</p>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                                Posting to: {selectedAccountIds.length} account{selectedAccountIds.length !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Schedule Section */}
                        <div className="mb-4">
                            <button
                                onClick={() => {
                                    triggerHaptic('light');
                                    onOpenScheduleModal();
                                }}
                                className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
                            >
                                <div>
                                    <p className="font-medium">Schedule</p>
                                    <p className="text-sm text-[var(--text-muted)]">
                                        {selectedDate.toLocaleDateString()} at {selectedTime}
                                    </p>
                                </div>
                                <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            <div
                className="flex gap-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] p-4"
                style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
                }}
            >
                {currentStep > 0 && (
                    <Button
                        variant="secondary"
                        onClick={handlePrev}
                        className="flex items-center gap-1"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                    </Button>
                )}

                <div className="flex-1" />

                {currentStep < STEPS.length - 1 ? (
                    <Button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="flex items-center gap-1"
                    >
                        Next
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                triggerHaptic('medium');
                                onDiscardDraft();
                            }}
                            disabled={isSubmitting || (!caption && media.length === 0)}
                            className="text-red-400 hover:text-red-300"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                triggerHaptic('medium');
                                onSave();
                            }}
                            disabled={isSubmitting || !hasContent}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                            onClick={() => {
                                triggerHaptic('medium');
                                onSchedule();
                            }}
                            disabled={isSubmitting || !hasContent || !hasSelectedAccounts}
                        >
                            {isScheduling ? 'Scheduling...' : 'Schedule'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
