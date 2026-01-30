/**
 * Notification Center Component
 * Real-time notifications with grouping and actions
 */

'use client';

import { useState } from 'react';
import {
    Bell, X, Check, AlertTriangle, CheckCircle,
    MessageCircle, Calendar, TrendingUp, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
    id: string;
    type: 'success' | 'warning' | 'info' | 'action';
    title: string;
    message: string;
    time: string;
    read: boolean;
    actionLabel?: string;
    actionHref?: string;
}

interface NotificationCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const [notifications, setNotifications] = useState<Notification[]>([
        {
            id: '1',
            type: 'success',
            title: 'Post Published',
            message: 'Your Instagram post "New summer collection..." was published successfully.',
            time: '2 min ago',
            read: false,
        },
        {
            id: '2',
            type: 'warning',
            title: 'Token Expiring',
            message: 'Your YouTube connection expires in 3 days. Reconnect to avoid interruption.',
            time: '1 hour ago',
            read: false,
            actionLabel: 'Reconnect',
            actionHref: '/settings?tab=accounts',
        },
        {
            id: '3',
            type: 'info',
            title: 'AI Suggestion',
            message: 'Post at 7:30 PM today for +40% reach on Instagram.',
            time: '3 hours ago',
            read: true,
            actionLabel: 'Schedule',
            actionHref: '/compose',
        },
        {
            id: '4',
            type: 'success',
            title: 'Weekly Report Ready',
            message: 'Your analytics report for last week is now available.',
            time: 'Yesterday',
            read: true,
            actionLabel: 'View Report',
            actionHref: '/analytics',
        },
    ]);

    const unreadCount = notifications.filter((n) => !n.read).length;

    const markAllRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const markAsRead = (id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
    };

    const dismiss = (id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-md bg-[var(--bg-secondary)] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold">Notifications</h2>
                        {unreadCount > 0 && (
                            <span className="rounded-full bg-[var(--accent-gold)] px-2 py-0.5 text-xs font-medium text-white">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-sm text-[var(--accent-gold)] hover:underline"
                            >
                                Mark all read
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Notifications List */}
                <div className="max-h-[calc(100vh-140px)] overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="py-16 text-center">
                            <Bell className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
                            <p className="mt-3 font-medium">All caught up!</p>
                            <p className="text-sm text-[var(--text-muted)]">
                                No new notifications
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--border)]">
                            {notifications.map((notification) => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onRead={() => markAsRead(notification.id)}
                                    onDismiss={() => dismiss(notification.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <a
                        href="/settings?tab=notifications"
                        className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                        <Settings className="h-4 w-4" />
                        Notification Settings
                    </a>
                </div>
            </div>
        </div>
    );
}

interface NotificationItemProps {
    notification: Notification;
    onRead: () => void;
    onDismiss: () => void;
}

function NotificationItem({ notification, onRead, onDismiss }: NotificationItemProps) {
    const icons = {
        success: CheckCircle,
        warning: AlertTriangle,
        info: TrendingUp,
        action: MessageCircle,
    };

    const colors = {
        success: 'text-[var(--success)] bg-[var(--success-light)]',
        warning: 'text-[var(--warning)] bg-[var(--warning-light)]',
        info: 'text-[var(--accent-gold)] bg-[var(--accent-gold-light)]',
        action: 'text-[var(--info)] bg-[var(--info-light)]',
    };

    const Icon = icons[notification.type];

    return (
        <div
            className={cn(
                'group relative px-6 py-4 transition-colors',
                !notification.read && 'bg-[var(--accent-gold-light)]/30'
            )}
            onClick={onRead}
        >
            {!notification.read && (
                <div className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--accent-gold)]" />
            )}

            <div className="flex gap-3">
                <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', colors[notification.type])}>
                    <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{notification.title}</p>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss();
                            }}
                            className="rounded p-1 text-[var(--text-muted)] opacity-0 hover:bg-[var(--bg-tertiary)] group-hover:opacity-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {notification.message}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-[var(--text-muted)]">
                            {notification.time}
                        </span>
                        {notification.actionLabel && (
                            <a
                                href={notification.actionHref}
                                className="text-sm font-medium text-[var(--accent-gold)] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {notification.actionLabel}
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Notification Bell Button
 */
interface NotificationBellProps {
    unreadCount: number;
    onClick: () => void;
}

export function NotificationBell({ unreadCount, onClick }: NotificationBellProps) {
    return (
        <button
            onClick={onClick}
            className="relative rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-gold)] text-[10px] font-medium text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}
