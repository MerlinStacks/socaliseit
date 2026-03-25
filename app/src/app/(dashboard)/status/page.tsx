'use client';

/**
 * System Status Dashboard
 * Comprehensive health monitoring for all platform components
 */

import { useState, useEffect } from 'react';
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    RefreshCw,
    Server,
    Database,
    Cloud,
    Settings,
    ListOrdered,
    Clock,
    Zap,
} from 'lucide-react';
import { clientLogger } from '@/lib/client-logger';

interface ServiceStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    message?: string;
}

interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}

interface PlatformStatus {
    platform: string;
    configured: boolean;
    hasAccounts: number;
}

interface HealthData {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: {
        database: ServiceStatus;
        redis: ServiceStatus;
        storage: ServiceStatus;
        environment: ServiceStatus;
    };
    queue: QueueStats | null;
    platforms: PlatformStatus[];
    worker: {
        active: boolean;
        lastJobTime?: string;
    };
    timestamp: string;
    version: string;
}

const PLATFORM_ICONS: Record<string, string> = {
    INSTAGRAM: '📸',
    FACEBOOK: '👤',
    TIKTOK: '🎵',
    YOUTUBE: '📺',
    PINTEREST: '📌',
    LINKEDIN: '💼',
};

export default function StatusPage() {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);

    async function fetchHealth() {
        try {
            const response = await fetch('/api/health/detailed');
            if (response.ok) {
                const data = await response.json();
                setHealth(data);
            }
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch health status');
        } finally {
            setIsLoading(false);
            setLastRefresh(new Date());
        }
    }

    useEffect(() => {
        fetchHealth();

        // Auto-refresh every 30 seconds
        if (autoRefresh) {
            const interval = setInterval(fetchHealth, 30000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh]);

    function getOverallStatusColor(status: string) {
        switch (status) {
            case 'healthy':
                return 'bg-green-600/20 border-green-600 text-green-400';
            case 'degraded':
                return 'bg-yellow-600/20 border-yellow-600 text-yellow-400';
            case 'unhealthy':
                return 'bg-red-600/20 border-red-600 text-red-400';
            default:
                return 'bg-gray-600/20 border-gray-600 text-gray-400';
        }
    }

    function getStatusIcon(status: string) {
        switch (status) {
            case 'healthy':
                return <CheckCircle className="w-5 h-5 text-green-400" />;
            case 'degraded':
                return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
            case 'unhealthy':
                return <XCircle className="w-5 h-5 text-red-400" />;
            default:
                return <Settings className="w-5 h-5 text-gray-400 animate-spin" />;
        }
    }

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] p-4 pb-28 md:p-6 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl md:text-3xl font-bold text-[var(--text-primary)] flex items-center gap-2 md:gap-3">
                            <Server className="w-6 h-6 md:w-8 md:h-8 text-indigo-400" />
                            System Status
                        </h1>
                        <p className="text-[var(--text-muted)] mt-1 text-sm md:text-base">
                            Monitor the health of all platform services
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-400">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded bg-gray-700 border-gray-600"
                            />
                            Auto-refresh
                        </label>
                        <button
                            onClick={fetchHealth}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Overall Status Banner */}
                {health && (
                    <div
                        className={`flex items-center justify-between p-6 rounded-xl border-2 ${getOverallStatusColor(health.overall)}`}
                    >
                        <div className="flex items-center gap-4">
                            {getStatusIcon(health.overall)}
                            <div>
                                <h2 className="text-xl font-bold capitalize">{health.overall}</h2>
                                <p className="text-sm opacity-75">
                                    Last checked: {lastRefresh.toLocaleTimeString()}
                                </p>
                            </div>
                        </div>
                        <div className="text-right text-sm opacity-75">
                            <p>Version: {health.version}</p>
                            <p>Server time: {new Date(health.timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                )}

                {/* Services Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {health && (
                        <>
                            <ServiceCard
                                title="Database"
                                icon={<Database className="w-6 h-6" />}
                                status={health.services.database}
                                description="PostgreSQL"
                            />
                            <ServiceCard
                                title="Cache & Queue"
                                icon={<Zap className="w-6 h-6" />}
                                status={health.services.redis}
                                description="Redis + BullMQ"
                            />
                            <ServiceCard
                                title="Storage"
                                icon={<Cloud className="w-6 h-6" />}
                                status={health.services.storage}
                                description="S3/MinIO"
                            />
                            <ServiceCard
                                title="Environment"
                                icon={<Settings className="w-6 h-6" />}
                                status={health.services.environment}
                                description="Configuration"
                            />
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Queue Stats */}
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <ListOrdered className="w-6 h-6 text-indigo-400" />
                            <h3 className="text-lg font-semibold text-white">Post Queue</h3>
                        </div>

                        {health?.queue ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <QueueStat
                                        label="Waiting"
                                        value={health.queue.waiting}
                                        color="text-blue-400"
                                    />
                                    <QueueStat
                                        label="Active"
                                        value={health.queue.active}
                                        color="text-yellow-400"
                                    />
                                    <QueueStat
                                        label="Delayed"
                                        value={health.queue.delayed}
                                        color="text-purple-400"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                                    <QueueStat
                                        label="Completed"
                                        value={health.queue.completed}
                                        color="text-green-400"
                                    />
                                    <QueueStat
                                        label="Failed"
                                        value={health.queue.failed}
                                        color="text-red-400"
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-400">Queue stats unavailable</p>
                        )}
                    </div>

                    {/* Worker Status */}
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <Clock className="w-6 h-6 text-indigo-400" />
                            <h3 className="text-lg font-semibold text-white">Worker Status</h3>
                        </div>

                        {health?.worker ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-3 h-3 rounded-full ${health.worker.active
                                            ? 'bg-green-500 animate-pulse'
                                            : 'bg-gray-500'
                                            }`}
                                    />
                                    <span className="text-white">
                                        {health.worker.active ? 'Worker is active' : 'Worker idle'}
                                    </span>
                                </div>

                                {health.worker.lastJobTime && (
                                    <p className="text-sm text-gray-400">
                                        Last job completed:{' '}
                                        {new Date(health.worker.lastJobTime).toLocaleString()}
                                    </p>
                                )}

                                <div className="pt-4 border-t border-gray-700">
                                    <p className="text-sm text-gray-400">
                                        The worker processes scheduled posts from the queue.
                                        {!health.worker.active && (
                                            <span className="block text-yellow-400 mt-2">
                                                ⚠️ If the worker is idle for too long, check that the
                                                worker container is running.
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-400">Worker status unavailable</p>
                        )}
                    </div>
                </div>

                {/* Platform Connections */}
                <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-3">
                            🔗 Platform Connections
                        </h3>
                        <a
                            href="/settings?tab=credentials"
                            className="text-indigo-400 hover:text-indigo-300 text-sm"
                        >
                            Configure →
                        </a>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {health?.platforms.map((platform) => (
                            <div
                                key={platform.platform}
                                className={`p-4 rounded-lg border ${platform.configured && platform.hasAccounts > 0
                                    ? 'bg-green-900/20 border-green-800'
                                    : platform.configured
                                        ? 'bg-yellow-900/20 border-yellow-800'
                                        : 'bg-gray-800/50 border-gray-700'
                                    }`}
                            >
                                <div className="text-2xl mb-2 text-center">
                                    {PLATFORM_ICONS[platform.platform] || '🔗'}
                                </div>
                                <p className="text-sm font-medium text-white text-center mb-1">
                                    {platform.platform}
                                </p>
                                <div className="text-xs text-center space-y-1">
                                    <p
                                        className={
                                            platform.configured ? 'text-green-400' : 'text-gray-500'
                                        }
                                    >
                                        {platform.configured ? '✓ Configured' : '○ Not configured'}
                                    </p>
                                    <p
                                        className={
                                            platform.hasAccounts > 0
                                                ? 'text-green-400'
                                                : 'text-gray-500'
                                        }
                                    >
                                        {platform.hasAccounts > 0
                                            ? `${platform.hasAccounts} account${platform.hasAccounts > 1 ? 's' : ''}`
                                            : 'No accounts'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-4 justify-center pt-4">
                    <a
                        href="/setup"
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                        🚀 Setup Wizard
                    </a>
                    <a
                        href="/settings?tab=accounts"
                        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        👤 Manage Accounts
                    </a>
                    <a
                        href="/compose"
                        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        ✏️ Create Post
                    </a>
                </div>
            </div>
        </div>
    );
}

// Helper Components
function ServiceCard({
    title,
    icon,
    status,
    description,
}: {
    title: string;
    icon: React.ReactNode;
    status: ServiceStatus;
    description: string;
}) {
    const bgColors = {
        healthy: 'bg-green-900/20 border-green-800',
        degraded: 'bg-yellow-900/20 border-yellow-800',
        unhealthy: 'bg-red-900/20 border-red-800',
    };

    const statusColors = {
        healthy: 'text-green-400',
        degraded: 'text-yellow-400',
        unhealthy: 'text-red-400',
    };

    return (
        <div className={`p-4 rounded-xl border ${bgColors[status.status]}`}>
            <div className="flex items-center gap-3 mb-3">
                <div className={statusColors[status.status]}>{icon}</div>
                <div>
                    <h4 className="font-medium text-white">{title}</h4>
                    <p className="text-xs text-gray-400">{description}</p>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <span className={`text-sm font-medium capitalize ${statusColors[status.status]}`}>
                    {status.status}
                </span>
                {status.latency && (
                    <span className="text-xs text-gray-400">{status.latency}ms</span>
                )}
            </div>
            {status.message && (
                <p className="text-xs text-gray-400 mt-2 truncate" title={status.message}>
                    {status.message}
                </p>
            )}
        </div>
    );
}

function QueueStat({
    label,
    value,
    color,
}: {
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div className="text-center">
            <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
            <p className="text-sm text-gray-400">{label}</p>
        </div>
    );
}
