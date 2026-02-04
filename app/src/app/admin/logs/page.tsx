'use client';

/**
 * Audit Logs Page
 * View admin action history
 */

import { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface AuditLog {
    id: string;
    action: string;
    actor: { id: string; name: string | null; email: string | null };
    targetId: string | null;
    targetType: string | null;
    metadata: Record<string, unknown> | null;
    ipAddress: string | null;
    createdAt: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const actionColors: Record<string, string> = {
    'user.promote_admin': 'text-red-400 bg-red-500/10',
    'user.revoke_admin': 'text-orange-400 bg-orange-500/10',
    'impersonate.start': 'text-amber-400 bg-amber-500/10',
    'impersonate.end': 'text-amber-400 bg-amber-500/10',
    'organization.create': 'text-purple-400 bg-purple-500/10',
    'organization.delete': 'text-red-400 bg-red-500/10',
    'settings.update': 'text-blue-400 bg-blue-500/10',
    'settings.registration_toggle': 'text-green-400 bg-green-500/10',
    'settings.maintenance_toggle': 'text-yellow-400 bg-yellow-500/10',
    'organization.view': 'text-gray-400 bg-gray-500/10',
};

export default function LogsPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [actionFilter, setActionFilter] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(actionFilter && { action: actionFilter }),
            });

            const res = await fetch(`/api/admin/logs?${params}`);
            const data = await res.json();

            setLogs(data.logs);
            setPagination(data.pagination);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, actionFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const formatAction = (action: string) => {
        return action.replace(/\./g, ' › ').replace(/_/g, ' ');
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
                <p className="text-gray-400 mt-1">
                    Track admin actions and changes
                </p>
            </div>

            {/* Filter */}
            <div className="flex gap-4 mb-6">
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <select
                        value={actionFilter}
                        onChange={(e) => {
                            setActionFilter(e.target.value);
                            setPagination((prev) => ({ ...prev, page: 1 }));
                        }}
                        className="rounded-lg border border-gray-800 bg-gray-900 pl-10 pr-8 py-2.5 text-sm text-white appearance-none focus:border-blue-500 focus:outline-none"
                    >
                        <option value="">All Actions</option>
                        <option value="user">User Actions</option>
                        <option value="impersonate">Impersonation</option>
                        <option value="organization">Organization Actions</option>
                        <option value="settings">Settings Changes</option>
                        <option value="workspace">Workspace Actions</option>
                    </select>
                </div>
            </div>

            {/* Log List */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                {loading ? (
                    <div className="px-6 py-12 text-center text-gray-400">Loading...</div>
                ) : logs.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <ScrollText className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-400">No audit logs found</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {logs.map((log) => {
                            const colorClass = actionColors[log.action] || 'text-gray-400 bg-gray-500/10';
                            return (
                                <div key={log.id} className="px-6 py-4 hover:bg-gray-800/50 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className={`rounded-lg px-2.5 py-1 text-xs font-medium ${colorClass}`}>
                                                {formatAction(log.action)}
                                            </div>
                                            <div>
                                                <p className="text-white">
                                                    <span className="font-medium">{log.actor.name || log.actor.email}</span>
                                                    {log.targetType && log.targetId && (
                                                        <span className="text-gray-400">
                                                            {' → '}{log.targetType}: {log.targetId.slice(0, 8)}...
                                                        </span>
                                                    )}
                                                </p>
                                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                    <p className="text-sm text-gray-500 mt-1 font-mono">
                                                        {JSON.stringify(log.metadata).slice(0, 100)}
                                                        {JSON.stringify(log.metadata).length > 100 && '...'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-gray-400">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </p>
                                            {log.ipAddress && (
                                                <p className="text-xs text-gray-600">{log.ipAddress}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-gray-400">
                        Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                            className="rounded-lg border border-gray-800 px-3 py-2 text-gray-400 hover:bg-gray-800 disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page === pagination.totalPages}
                            className="rounded-lg border border-gray-800 px-3 py-2 text-gray-400 hover:bg-gray-800 disabled:opacity-50"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
