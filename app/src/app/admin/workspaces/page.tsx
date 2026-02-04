'use client';

/**
 * Workspaces Management Page
 * View all workspaces with detail modal and delete action
 * Why: Super admin needs to view and manage all workspaces on the platform
 */

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Search, ChevronLeft, ChevronRight, Users, FileText, Share2, X, Trash2, AlertTriangle, Building2, Image } from 'lucide-react';

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

interface WorkspaceDetail {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    timezone: string;
    createdAt: string;
    organization: { id: string; name: string; slug: string; tier: string } | null;
    members: Array<{
        id: string;
        role: string;
        joinedAt: string;
        user: { id: string; name: string | null; email: string; image: string | null };
    }>;
    socialAccounts: Array<{
        id: string;
        platform: string;
        name: string;
        username: string | null;
        isActive: boolean;
    }>;
    stats: {
        postCount: number;
        mediaCount: number;
        memberCount: number;
        socialAccountCount: number;
    };
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

    // Modal states
    const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

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

    const openWorkspaceDetail = async (workspaceId: string) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/admin/workspaces/${workspaceId}`);
            const data = await res.json();
            setSelectedWorkspace(data.workspace);
        } catch (error) {
            console.error('Failed to fetch workspace details:', error);
        } finally {
            setLoadingDetail(false);
        }
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
                                <tr
                                    key={ws.id}
                                    onClick={() => openWorkspaceDetail(ws.id)}
                                    className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                                >
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

            {/* Workspace Detail Modal */}
            {(selectedWorkspace || loadingDetail) && (
                <WorkspaceDetailModal
                    workspace={selectedWorkspace}
                    loading={loadingDetail}
                    onClose={() => setSelectedWorkspace(null)}
                    onDeleted={() => {
                        setSelectedWorkspace(null);
                        fetchWorkspaces();
                    }}
                />
            )}
        </div>
    );
}

/**
 * Workspace Detail Modal
 * Why: View detailed workspace info and delete if needed
 */
function WorkspaceDetailModal({
    workspace,
    loading,
    onClose,
    onDeleted,
}: {
    workspace: WorkspaceDetail | null;
    loading: boolean;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        if (!workspace) return;
        setDeleting(true);

        try {
            const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                onDeleted();
            } else {
                const error = await res.json();
                alert(error.message || 'Failed to delete workspace');
            }
        } catch {
            console.error('Failed to delete workspace');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-6">
                {loading ? (
                    <div className="py-12 text-center text-gray-400">Loading...</div>
                ) : !workspace ? (
                    <div className="py-12 text-center text-gray-400">Workspace not found</div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                                    <Briefcase className="h-6 w-6 text-green-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">{workspace.name}</h2>
                                    <p className="text-sm text-gray-500">/{workspace.slug}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                                <button onClick={onClose} className="text-gray-400 hover:text-white">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Delete Confirmation */}
                        {showDeleteConfirm && (
                            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 p-4">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="font-medium text-red-400">Delete Workspace?</p>
                                        <p className="text-sm text-red-200/70 mt-1">
                                            This will permanently delete all posts, media, and social connections.
                                        </p>
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={handleDelete}
                                                disabled={deleting}
                                                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteConfirm(false)}
                                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                                <p className="text-2xl font-bold text-white">{workspace.stats.memberCount}</p>
                                <p className="text-xs text-gray-400">Members</p>
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                                <p className="text-2xl font-bold text-white">{workspace.stats.postCount}</p>
                                <p className="text-xs text-gray-400">Posts</p>
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                                <p className="text-2xl font-bold text-white">{workspace.stats.mediaCount}</p>
                                <p className="text-xs text-gray-400">Media</p>
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-center">
                                <p className="text-2xl font-bold text-white">{workspace.stats.socialAccountCount}</p>
                                <p className="text-xs text-gray-400">Accounts</p>
                            </div>
                        </div>

                        {/* Organization */}
                        {workspace.organization && (
                            <div className="mb-6 rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Building2 className="h-4 w-4 text-purple-400" />
                                    <span className="text-sm text-gray-400">Organization</span>
                                </div>
                                <p className="text-white font-medium">{workspace.organization.name}</p>
                                <span className="text-xs text-purple-400">{workspace.organization.tier}</span>
                            </div>
                        )}

                        {/* Members */}
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <Users className="h-4 w-4 text-gray-400" />
                                <h3 className="font-medium text-white">Members ({workspace.members.length})</h3>
                            </div>
                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                                {workspace.members.map((m) => (
                                    <div key={m.id} className="flex items-center justify-between px-4 py-2">
                                        <div className="flex items-center gap-2">
                                            {m.user.image ? (
                                                <img src={m.user.image} alt="" className="h-7 w-7 rounded-full" />
                                            ) : (
                                                <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                    <span className="text-xs text-blue-400">
                                                        {m.user.name?.charAt(0) || m.user.email.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <span className="text-sm text-white">{m.user.name || m.user.email}</span>
                                        </div>
                                        <span className="text-xs text-gray-500">{m.role}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Social Accounts */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Share2 className="h-4 w-4 text-gray-400" />
                                <h3 className="font-medium text-white">Social Accounts ({workspace.socialAccounts.length})</h3>
                            </div>
                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                                {workspace.socialAccounts.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-gray-500">No social accounts connected</p>
                                ) : (
                                    workspace.socialAccounts.map((acc) => (
                                        <div key={acc.id} className="flex items-center justify-between px-4 py-2">
                                            <div>
                                                <span className="text-sm text-white">{acc.name}</span>
                                                {acc.username && (
                                                    <span className="text-xs text-gray-500 ml-2">@{acc.username}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 capitalize">{acc.platform.toLowerCase()}</span>
                                                <span className={`h-2 w-2 rounded-full ${acc.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-6 pt-4 border-t border-gray-800 text-xs text-gray-500">
                            Created {new Date(workspace.createdAt).toLocaleString()} · Timezone: {workspace.timezone || 'UTC'}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
