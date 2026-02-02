'use client';

/**
 * Onboarding Tour Component
 * Tooltip-based step-by-step guided tour for first-time users
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cn } from '@/lib/utils';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from './button';

// ============================================================================
// Types
// ============================================================================

export interface TourStep {
    /** Unique identifier for the step */
    id: string;
    /** Target element selector (CSS selector) */
    target: string;
    /** Title of the tooltip */
    title: string;
    /** Description content */
    content: string | ReactNode;
    /** Tooltip placement relative to target */
    placement?: 'top' | 'bottom' | 'left' | 'right';
    /** Optional action to execute when this step is shown */
    onShow?: () => void;
    /** Optional highlight padding around target */
    highlightPadding?: number;
}

interface TourState {
    /** Whether the tour is currently active */
    isActive: boolean;
    /** Current step index */
    currentStep: number;
    /** ID of the current tour (to support multiple tours) */
    tourId: string | null;
    /** Completed tour IDs */
    completedTours: string[];
}

interface TourActions {
    startTour: (tourId: string) => void;
    nextStep: () => void;
    prevStep: () => void;
    endTour: () => void;
    skipTour: () => void;
    markCompleted: (tourId: string) => void;
    isCompleted: (tourId: string) => boolean;
    reset: () => void;
}

// ============================================================================
// Zustand Store with Persistence
// ============================================================================

export const useTourStore = create<TourState & TourActions>()(
    persist(
        (set, get) => ({
            isActive: false,
            currentStep: 0,
            tourId: null,
            completedTours: [],

            startTour: (tourId) => {
                if (get().completedTours.includes(tourId)) return;
                set({ isActive: true, currentStep: 0, tourId });
            },

            nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),

            prevStep: () => set((state) => ({
                currentStep: Math.max(0, state.currentStep - 1)
            })),

            endTour: () => {
                const tourId = get().tourId;
                if (tourId) {
                    set((state) => ({
                        isActive: false,
                        currentStep: 0,
                        tourId: null,
                        completedTours: [...state.completedTours, tourId],
                    }));
                }
            },

            skipTour: () => {
                const tourId = get().tourId;
                if (tourId) {
                    set((state) => ({
                        isActive: false,
                        currentStep: 0,
                        tourId: null,
                        completedTours: [...state.completedTours, tourId],
                    }));
                }
            },

            markCompleted: (tourId) => set((state) => ({
                completedTours: [...state.completedTours, tourId],
            })),

            isCompleted: (tourId) => get().completedTours.includes(tourId),

            reset: () => set({
                isActive: false,
                currentStep: 0,
                tourId: null,
                completedTours: []
            }),
        }),
        {
            name: 'socialiseit-onboarding',
            partialize: (state) => ({ completedTours: state.completedTours }),
        }
    )
);

// ============================================================================
// Tour Provider Component
// ============================================================================

interface TourProviderProps {
    children: ReactNode;
    tourId: string;
    steps: TourStep[];
    /** Auto-start tour for new users */
    autoStart?: boolean;
}

export function TourProvider({
    children,
    tourId,
    steps,
    autoStart = true
}: TourProviderProps) {
    const { isActive, currentStep, tourId: activeTourId, startTour, isCompleted } = useTourStore();
    const isThisTourActive = isActive && activeTourId === tourId;
    const currentStepData = isThisTourActive ? steps[currentStep] : null;

    // Auto-start for new users
    useEffect(() => {
        if (autoStart && !isCompleted(tourId) && !isActive) {
            const timer = setTimeout(() => startTour(tourId), 1000);
            return () => clearTimeout(timer);
        }
    }, [autoStart, tourId, isCompleted, isActive, startTour]);

    // Execute step onShow callback
    useEffect(() => {
        if (currentStepData?.onShow) {
            currentStepData.onShow();
        }
    }, [currentStepData]);

    return (
        <>
            {children}
            {isThisTourActive && currentStepData && (
                <TourTooltip
                    step={currentStepData}
                    stepIndex={currentStep}
                    totalSteps={steps.length}
                />
            )}
        </>
    );
}

// ============================================================================
// Tour Tooltip Component
// ============================================================================

interface TourTooltipProps {
    step: TourStep;
    stepIndex: number;
    totalSteps: number;
}

function TourTooltip({ step, stepIndex, totalSteps }: TourTooltipProps) {
    const { nextStep, prevStep, endTour, skipTour } = useTourStore();
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const isLastStep = stepIndex === totalSteps - 1;
    const isFirstStep = stepIndex === 0;

    // Calculate tooltip position based on target element
    const updatePosition = useCallback(() => {
        const target = document.querySelector(step.target);
        if (!target) return;

        const rect = target.getBoundingClientRect();
        setTargetRect(rect);

        const padding = step.highlightPadding ?? 8;
        const tooltipWidth = 320;
        const tooltipHeight = 180;
        const margin = 12;

        let top = 0;
        let left = 0;

        switch (step.placement ?? 'bottom') {
            case 'top':
                top = rect.top - tooltipHeight - margin;
                left = rect.left + rect.width / 2 - tooltipWidth / 2;
                break;
            case 'bottom':
                top = rect.bottom + margin;
                left = rect.left + rect.width / 2 - tooltipWidth / 2;
                break;
            case 'left':
                top = rect.top + rect.height / 2 - tooltipHeight / 2;
                left = rect.left - tooltipWidth - margin;
                break;
            case 'right':
                top = rect.top + rect.height / 2 - tooltipHeight / 2;
                left = rect.right + margin;
                break;
        }

        // Keep tooltip in viewport
        left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));
        top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));

        setPosition({ top, left });
    }, [step]);

    useEffect(() => {
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition);
        };
    }, [updatePosition]);

    const handleNext = () => {
        if (isLastStep) {
            endTour();
        } else {
            nextStep();
        }
    };

    return (
        <>
            {/* Overlay backdrop */}
            <div
                className="fixed inset-0 z-[9998] bg-black/50 transition-opacity duration-300"
                onClick={skipTour}
            />

            {/* Highlight box around target */}
            {targetRect && (
                <div
                    className="fixed z-[9999] rounded-lg ring-4 ring-[var(--accent-gold)] ring-opacity-50 pointer-events-none transition-all duration-300"
                    style={{
                        top: targetRect.top - (step.highlightPadding ?? 8),
                        left: targetRect.left - (step.highlightPadding ?? 8),
                        width: targetRect.width + (step.highlightPadding ?? 8) * 2,
                        height: targetRect.height + (step.highlightPadding ?? 8) * 2,
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                    }}
                />
            )}

            {/* Tooltip */}
            <div
                className={cn(
                    'fixed z-[10000] w-80 glass-card p-4 animate-scale-in',
                    'shadow-xl border border-[var(--border)]'
                )}
                style={{ top: position.top, left: position.left }}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-[var(--text-primary)]">
                        {step.title}
                    </h3>
                    <button
                        onClick={skipTour}
                        className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
                        aria-label="Skip tour"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="text-sm text-[var(--text-secondary)] mb-4">
                    {step.content}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                    {/* Progress dots */}
                    <div className="flex gap-1.5">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    'w-2 h-2 rounded-full transition-colors',
                                    i === stepIndex
                                        ? 'bg-[var(--accent-gold)]'
                                        : i < stepIndex
                                            ? 'bg-[var(--accent-gold)]/50'
                                            : 'bg-[var(--border)]'
                                )}
                            />
                        ))}
                    </div>

                    {/* Navigation buttons */}
                    <div className="flex gap-2">
                        {!isFirstStep && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={prevStep}
                                className="px-2"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            size="sm"
                            onClick={handleNext}
                            className="btn-interactive"
                        >
                            {isLastStep ? (
                                <>
                                    <Check className="w-4 h-4 mr-1" />
                                    Done
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ============================================================================
// Pre-built Tours
// ============================================================================

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
    {
        id: 'sidebar',
        target: '[data-tour="sidebar"]',
        title: 'Navigation',
        content: 'Use the sidebar to navigate between different sections of your dashboard.',
        placement: 'right',
    },
    {
        id: 'compose',
        target: '[data-tour="compose-button"]',
        title: 'Create Posts',
        content: 'Click here to create a new post. You can schedule it or publish immediately.',
        placement: 'bottom',
    },
    {
        id: 'calendar',
        target: '[data-tour="calendar-link"]',
        title: 'Content Calendar',
        content: 'View and manage all your scheduled posts in the calendar view.',
        placement: 'right',
    },
    {
        id: 'analytics',
        target: '[data-tour="analytics-link"]',
        title: 'Analytics',
        content: 'Track your performance metrics and engagement across all connected platforms.',
        placement: 'right',
    },
];
