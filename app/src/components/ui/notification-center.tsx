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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

export interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
    isRead: boolean;
    link?: string;
    actionLabel?: string;
    actionHref?: string;
}

export function useNotifications() {
    const queryClient = useQueryClient();

    const query = useQuery<{ notifications: Notification[], count: number }>({
        queryKey: ['notifications'],
        queryFn: async () => {
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('Failed to fetch notifications');
            return res.json();
        },
        refetchInterval: 30000,
        refetchIntervalInBackground: false,
    });

    const notifications = query.data?.notifications || [];
    const unreadCount = query.data?.count || 0;

    const { mutateAsync: markReadMutate } = useMutation({
        mutationFn: async (notificationIds: string[]) => {
            const res = await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds })
            });
            if (!res.ok) throw new Error('Failed to update notifications');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
    });

    return {
        notifications,
        unreadCount,
        isLoading: query.isLoading,
        markReadMutate,
    };
}

interface NotificationCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const { notifications, unreadCount, markReadMutate } = useNotifications();

    const markAllRead = () => {
        const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
        if (unreadIds.length > 0) {
            markReadMutate(unreadIds);
        }
    };

    const markAsRead = (id: string) => {
        markReadMutate([id]);
    };

    const dismiss = (id: string) => {
        markReadMutate([id]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-md bg-[var(--bg-secondary)] shadow-2xl safe-area-top">
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
                <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] p-4 pb-[max(env(safe-area-inset-bottom,16px),calc(72px+16px))] md:pb-4">
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
    const typeMap = {
        success: { icon: CheckCircle, colors: 'text-[var(--success)] bg-[var(--success-light)]' },
        warning: { icon: AlertTriangle, colors: 'text-[var(--warning)] bg-[var(--warning-light)]' },
        info: { icon: TrendingUp, colors: 'text-[var(--accent-gold)] bg-[var(--accent-gold-light)]' },
        action: { icon: MessageCircle, colors: 'text-[var(--info)] bg-[var(--info-light)]' },
        alert: { icon: AlertTriangle, colors: 'text-red-500 bg-red-500/10' }
    };

    const displayType = typeMap[notification.type as keyof typeof typeMap] || typeMap.info;
    const Icon = displayType.icon;

    return (
        <div
            className={cn(
                'group relative px-6 py-4 transition-colors',
                !notification.isRead && 'bg-[var(--accent-gold-light)]/30',
                notification.link && 'cursor-pointer hover:bg-[var(--bg-tertiary)]'
            )}
            onClick={() => {
                onRead();
                if (notification.link && typeof window !== 'undefined') {
                    window.location.href = notification.link;
                }
            }}
        >
            {!notification.isRead && (
                <div className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--accent-gold)]" />
            )}

            <div className="flex gap-3">
                <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', displayType.colors)}>
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
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                        {notification.actionLabel && notification.actionHref && (
                            <a
                                href={notification.actionHref}
                                className="text-sm font-medium text-[var(--accent-gold)] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {notification.actionLabel}
                            </a>
                        )}
                        {notification.link && !notification.actionLabel && (
                            <span className="text-sm font-medium text-[var(--accent-gold)] hover:underline">
                                View
                            </span>
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
    onClick: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
    const { unreadCount } = useNotifications();

    return (
        <button
            type="button"
            onClick={onClick}
            className="relative rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            title="Notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-gold)] text-[10px] font-medium text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}
