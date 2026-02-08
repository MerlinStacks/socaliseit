'use client';

/**
 * Toast notification component and provider
 * Uses Zustand for state management
 *
 * Features: dark mode, 5-toast stacking limit, deduplication, progress bar
 */

import { useEffect, useState, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

// Toast Types
type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    description?: string;
    duration?: number;
    action?: ToastAction;
    createdAt: number;
}

// Max visible toasts at once
const MAX_TOASTS = 5;

// Dedup window — ignore identical toasts within this period
const DEDUP_WINDOW_MS = 2000;

// Zustand Store
interface ToastStore {
    toasts: Toast[];
    add: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
    remove: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
    toasts: [],
    add: (toast) =>
        set((state) => {
            // Dedup: skip if an identical toast was added recently
            const now = Date.now();
            const isDupe = state.toasts.some(
                (t) =>
                    t.type === toast.type &&
                    t.title === toast.title &&
                    now - t.createdAt < DEDUP_WINDOW_MS
            );
            if (isDupe) return state;

            const newToast: Toast = {
                ...toast,
                id: Math.random().toString(36).slice(2),
                createdAt: now,
            };

            // Cap at MAX_TOASTS — oldest get dropped
            return {
                toasts: [...state.toasts, newToast].slice(-MAX_TOASTS),
            };
        }),
    remove: (id) =>
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        })),
}));

// Helper function
export function toast(type: ToastType, title: string, description?: string) {
    useToast.getState().add({ type, title, description, duration: 5000 });
}

/**
 * Show a toast with a contextual action button
 * @example toastWithAction('error', 'Connection failed', { label: 'Retry', onClick: refetch })
 */
export function toastWithAction(
    type: ToastType,
    title: string,
    action: ToastAction,
    description?: string
) {
    useToast.getState().add({ type, title, description, action, duration: 8000 });
}

// Toast Provider Component
export function ToastProvider({ children }: { children: ReactNode }) {
    const { toasts, remove } = useToast();

    return (
        <>
            {children}
            <div
                className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
                role="region"
                aria-label="Notifications"
                aria-live="polite"
                aria-atomic="false"
            >
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
                ))}
            </div>
        </>
    );
}

// Individual Toast with progress bar
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const [isVisible, setIsVisible] = useState(false);
    const [progress, setProgress] = useState(100);
    const startTimeRef = useRef(Date.now());
    const duration = toast.duration ?? 5000;

    useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));
        startTimeRef.current = Date.now();

        // Progress countdown
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(remaining);

            if (remaining === 0) {
                clearInterval(interval);
                setIsVisible(false);
                setTimeout(onClose, 200);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [duration, onClose]);

    const icons = {
        success: CheckCircle,
        error: AlertCircle,
        warning: AlertTriangle,
        info: Info,
    };

    const borderColors = {
        success: 'border-l-[var(--success)]',
        error: 'border-l-[var(--error)]',
        warning: 'border-l-[var(--warning)]',
        info: 'border-l-[var(--info)]',
    };

    const bgColors = {
        success: 'bg-[var(--success-light)]',
        error: 'bg-[var(--error-light)]',
        warning: 'bg-[var(--warning-light)]',
        info: 'bg-[var(--info-light)]',
    };

    const iconColors = {
        success: 'text-[var(--success)]',
        error: 'text-[var(--error)]',
        warning: 'text-[var(--warning)]',
        info: 'text-[var(--info)]',
    };

    const progressColors = {
        success: 'bg-[var(--success)]',
        error: 'bg-[var(--error)]',
        warning: 'bg-[var(--warning)]',
        info: 'bg-[var(--info)]',
    };

    const buttonBg = {
        success: 'bg-[var(--success)] hover:opacity-90',
        error: 'bg-[var(--error)] hover:opacity-90',
        warning: 'bg-[var(--warning)] hover:opacity-90',
        info: 'bg-[var(--info)] hover:opacity-90',
    };

    const Icon = icons[toast.type];

    return (
        <div
            className={cn(
                'relative flex w-80 items-start gap-3 overflow-hidden rounded-lg border-l-4 p-4 shadow-lg transition-all duration-200',
                borderColors[toast.type],
                bgColors[toast.type],
                isVisible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            )}
        >
            <Icon className={cn('h-5 w-5 flex-shrink-0', iconColors[toast.type])} />
            <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)]">{toast.title}</p>
                {toast.description && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{toast.description}</p>
                )}
                {toast.action && (
                    <button
                        onClick={() => {
                            toast.action?.onClick();
                            onClose();
                        }}
                        className={cn(
                            'mt-2 rounded-md px-3 py-1 text-sm font-medium text-white',
                            'transition-all duration-150 active:scale-95',
                            buttonBg[toast.type]
                        )}
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={onClose}
                className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
                <X className="h-4 w-4" />
            </button>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--bg-tertiary)]">
                <div
                    className={cn('h-full transition-all duration-100', progressColors[toast.type])}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
