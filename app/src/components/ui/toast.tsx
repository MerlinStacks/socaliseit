'use client';

/**
 * Toast notification component and provider
 * Uses Zustand for state management
 */

import { useEffect, useState, type ReactNode } from 'react';
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
}

// Zustand Store
interface ToastStore {
    toasts: Toast[];
    add: (toast: Omit<Toast, 'id'>) => void;
    remove: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
    toasts: [],
    add: (toast) =>
        set((state) => ({
            toasts: [
                ...state.toasts,
                { ...toast, id: Math.random().toString(36).slice(2) },
            ],
        })),
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

// Individual Toast
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));

        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onClose, 200);
        }, toast.duration ?? 5000);

        return () => clearTimeout(timer);
    }, [toast.duration, onClose]);

    const icons = {
        success: CheckCircle,
        error: AlertCircle,
        warning: AlertTriangle,
        info: Info,
    };

    const colors = {
        success: 'border-l-green-500 bg-green-50',
        error: 'border-l-red-500 bg-red-50',
        warning: 'border-l-orange-500 bg-orange-50',
        info: 'border-l-blue-500 bg-blue-50',
    };

    const iconColors = {
        success: 'text-green-500',
        error: 'text-red-500',
        warning: 'text-orange-500',
        info: 'text-blue-500',
    };

    const Icon = icons[toast.type];

    return (
        <div
            className={cn(
                'flex w-80 items-start gap-3 rounded-lg border-l-4 bg-white p-4 shadow-lg transition-all duration-200',
                colors[toast.type],
                isVisible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            )}
        >
            <Icon className={cn('h-5 w-5 flex-shrink-0', iconColors[toast.type])} />
            <div className="flex-1">
                <p className="font-medium text-gray-900">{toast.title}</p>
                {toast.description && (
                    <p className="mt-1 text-sm text-gray-600">{toast.description}</p>
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
                            toast.type === 'error' && 'bg-red-500 hover:bg-red-600',
                            toast.type === 'warning' && 'bg-orange-500 hover:bg-orange-600',
                            toast.type === 'info' && 'bg-blue-500 hover:bg-blue-600',
                            toast.type === 'success' && 'bg-green-500 hover:bg-green-600'
                        )}
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={onClose}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
