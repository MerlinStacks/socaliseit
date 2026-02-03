'use client';

/**
 * Workspaces Management Page
 * View all workspaces across the platform
 */

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Search, ChevronLeft, ChevronRight, Users, FileText, Share2 } from 'lucide-react';

interface Workspace {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    createdAt: string;
    organization: { id: string; name: string; slug: string } | null;
    owner: { id: string; name: string | null; email: string; image: string | null } | null;
    memberCount: number;
    postCount: number;
    socialAccountCount: number;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function WorkspacesPage() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchWorkspaces = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(search && { search }),
            });

            const res = await fetch(`/api/admin/workspaces?${params}`);
            const data = await res.json();

            setWorkspaces(data.workspaces);
            setPagination(data.pagination);
        } catch (error) {
            console.error('Failed to fetch workspaces:', error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, search]);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPagination((prev) => ({ ...prev, page: 1 }));
        fetchWorkspaces();
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Workspaces</h1>
                <p className="text-gray-400 mt-1">
                    View all workspaces across the platform
                </p>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="mb-6 max-w-md">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search workspaces..."
                        className="w-full rounded-lg border border-gray-800 bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
                    />
                </div>
            </form>

            {/* Table */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-800">
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Workspace
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Owner
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Organization
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                                <Users className="h-4 w-4 inline" />
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                                <FileText className="h-4 w-4 inline" />
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                                <Share2 className="h-4 w-4 inline" />
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Created
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                    Loading...
                                </td>
                            </tr>
                        ) : workspaces.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center">
                                    <Briefcase className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                                    <p className="text-gray-400">No workspaces found</p>
                                </td>
                            </tr>
                        ) : (
                            workspaces.map((ws) => (
                                <tr key={ws.id} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                                                <Briefcase className="h-5 w-5 text-green-400" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-white">{ws.name}</p>
                                                <p className="text-sm text-gray-500">/{ws.slug}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {ws.owner ? (
                                            <div className="flex items-center gap-2">
                                                {ws.owner.image ? (
                                                    <img src={ws.owner.image} alt="" className="h-6 w-6 rounded-full" />
                                                ) : (
                                                    <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                        <span className="text-xs text-blue-400">
                                                            {ws.owner.name?.charAt(0) || ws.owner.email.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                )}
                                                <span className="text-gray-300 text-sm">{ws.owner.name || ws.owner.email}</span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-500">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {ws.organization ? (
                                            <span className="text-purple-400 text-sm">{ws.organization.name}</span>
                                        ) : (
                                            <span className="text-gray-500 text-sm">Standalone</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center text-gray-300">{ws.memberCount}</td>
                                    <td className="px-6 py-4 text-center text-gray-300">{ws.postCount}</td>
                                    <td className="px-6 py-4 text-center text-gray-300">{ws.socialAccountCount}</td>
                                    <td className="px-6 py-4 text-gray-400 text-sm">
                                        {new Date(ws.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
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
