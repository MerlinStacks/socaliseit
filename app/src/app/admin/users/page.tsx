'use client';

/**
 * Users Management Page
 * List, search, and manage all users with impersonation support
 * Why: Super admin needs to manage users and troubleshoot via impersonation
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, ChevronLeft, ChevronRight, Shield, ShieldOff, X, Eye, Briefcase, Building2, Clock, UserCheck, Trash2, AlertTriangle, Ban } from 'lucide-react';
import { clientLogger } from '@/lib/client-logger';

interface User {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isSuperAdmin: boolean;
    bannedAt: string | null;
    emailVerified: string | null;
    workspaceCount: number;
    organizationCount: number;
    createdAt: string;
}

interface UserDetail {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isSuperAdmin: boolean;
    bannedAt: string | null;
    banReason: string | null;
    emailVerified: string | null;
    twoFactorEnabled: boolean;
    createdAt: string;
    workspaces: Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
        joinedAt: string;
    }>;
    organizations: Array<{
        id: string;
        name: string;
        slug: string;
        tier: string;
        role: string;
        joinedAt: string;
    }>;
    recentSessions: Array<{
        id: string;
        deviceName: string | null;
        lastUsedAt: string;
        createdAt: string;
    }>;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [search, setSearch] = useState('');
    const [superAdminOnly, setSuperAdminOnly] = useState(false);
    const [loading, setLoading] = useState(true);

    // Modal states
    const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(search && { search }),
                ...(superAdminOnly && { superAdmin: 'true' }),
            });

            const res = await fetch(`/api/admin/users?${params}`);
            const data = await res.json();

            setUsers(data.users);
            setPagination(data.pagination);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch users');
        } finally {
            setLoading(false);
        }
    }, [pagination.page, search, superAdminOnly]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPagination((prev) => ({ ...prev, page: 1 }));
        fetchUsers();
    };

    const toggleSuperAdmin = async (userId: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isSuperAdmin: !currentStatus }),
            });

            if (res.ok) {
                setUsers((prev) =>
                    prev.map((u) =>
                        u.id === userId ? { ...u, isSuperAdmin: !currentStatus } : u
                    )
                );
            } else {
                const error = await res.json();
                alert(error.message || 'Failed to update user');
            }
        } catch (error) {
            clientLogger.error({ error }, 'Failed to toggle super admin');
        }
    };

    /** Ban or unban a user */
    const handleBan = async (userId: string, isBanned: boolean) => {
        try {
            if (isBanned) {
                // Unban
                const res = await fetch(`/api/admin/users/${userId}/ban`, { method: 'DELETE' });
                if (res.ok) {
                    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, bannedAt: null } : u));
                    if (selectedUser?.id === userId) {
                        setSelectedUser({ ...selectedUser, bannedAt: null, banReason: null });
                    }
                } else {
                    const error = await res.json();
                    alert(error.error || 'Failed to unban user');
                }
            } else {
                // Ban — prompt for reason
                const reason = prompt('Ban reason (optional):') || 'Banned by admin';
                const res = await fetch(`/api/admin/users/${userId}/ban`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason }),
                });
                if (res.ok) {
                    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, bannedAt: new Date().toISOString() } : u));
                    if (selectedUser?.id === userId) {
                        setSelectedUser({ ...selectedUser, bannedAt: new Date().toISOString(), banReason: reason });
                    }
                } else {
                    const error = await res.json();
                    alert(error.error || 'Failed to ban user');
                }
            }
        } catch (error) {
            clientLogger.error({ error }, 'Failed to ban/unban user');
        }
    };

    const openUserDetail = async (userId: string) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/admin/users/${userId}`);
            const data = await res.json();
            setSelectedUser(data.user);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch user details');
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleImpersonate = async (userId: string) => {
        try {
            const res = await fetch('/api/admin/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            if (res.ok) {
                // Reload the page to apply impersonation
                window.location.href = '/dashboard';
            } else {
                const error = await res.json();
                alert(error.message || 'Failed to start impersonation');
            }
        } catch (error) {
            clientLogger.error({ error }, 'Failed to impersonate');
        }
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Users</h1>
                <p className="text-gray-400 mt-1">
                    Manage user accounts and super admin access
                </p>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <form onSubmit={handleSearch} className="flex-1 max-w-md">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full rounded-lg border border-gray-800 bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                </form>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={superAdminOnly}
                        onChange={(e) => {
                            setSuperAdminOnly(e.target.checked);
                            setPagination((prev) => ({ ...prev, page: 1 }));
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-400">Super admins only</span>
                </label>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-800">
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                User
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Workspaces
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Organizations
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Joined
                            </th>
                            <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                                    Loading...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center">
                                    <Users className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                                    <p className="text-gray-400">No users found</p>
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div
                                            className="flex items-center gap-3 cursor-pointer"
                                            onClick={() => openUserDetail(user.id)}
                                        >
                                            {user.image ? (
                                                <img
                                                    src={user.image}
                                                    alt=""
                                                    className="h-10 w-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                    <span className="text-sm font-medium text-blue-400">
                                                        {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-medium text-white hover:text-blue-400">{user.name || 'Unnamed'}</p>
                                                <p className="text-sm text-gray-500">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {user.bannedAt && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                                                    <Ban className="h-3 w-3" />
                                                    Banned
                                                </span>
                                            )}
                                            {user.isSuperAdmin && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                                                    <Shield className="h-3 w-3" />
                                                    Super Admin
                                                </span>
                                            )}
                                            {user.emailVerified && (
                                                <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-400">
                                                    Verified
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">{user.workspaceCount}</td>
                                    <td className="px-6 py-4 text-gray-300">{user.organizationCount}</td>
                                    <td className="px-6 py-4 text-gray-400 text-sm">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {/* Impersonate button - only for non-super-admins */}
                                            {!user.isSuperAdmin && (
                                                <button
                                                    onClick={() => handleImpersonate(user.id)}
                                                    title="Impersonate user"
                                                    className="rounded-lg p-2 text-gray-400 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSuperAdmin(user.id, user.isSuperAdmin);
                                                }}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${user.isSuperAdmin
                                                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                                    }`}
                                            >
                                                {user.isSuperAdmin ? (
                                                    <span className="flex items-center gap-1">
                                                        <ShieldOff className="h-3 w-3" />
                                                        Revoke Admin
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <Shield className="h-3 w-3" />
                                                        Make Admin
                                                    </span>
                                                )}
                                            </button>
                                            {/* Ban / Unban — only for non-super-admins */}
                                            {!user.isSuperAdmin && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleBan(user.id, !!user.bannedAt);
                                                    }}
                                                    title={user.bannedAt ? 'Unban user' : 'Ban user'}
                                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${user.bannedAt
                                                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                                        : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                                                        }`}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        <Ban className="h-3 w-3" />
                                                        {user.bannedAt ? 'Unban' : 'Ban'}
                                                    </span>
                                                </button>
                                            )}
                                        </div>
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
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                            className="rounded-lg border border-gray-800 px-3 py-2 text-gray-400 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page === pagination.totalPages}
                            className="rounded-lg border border-gray-800 px-3 py-2 text-gray-400 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* User Detail Modal */}
            {(selectedUser || loadingDetail) && (
                <UserDetailModal
                    user={selectedUser}
                    loading={loadingDetail}
                    onClose={() => setSelectedUser(null)}
                    onImpersonate={handleImpersonate}
                    onBan={handleBan}
                    onDeleted={() => {
                        setSelectedUser(null);
                        fetchUsers();
                    }}
                />
            )}
        </div>
    );
}

/**
 * User Detail Modal
 * Why: View detailed user info and impersonate for troubleshooting
 */
function UserDetailModal({
    user,
    loading,
    onClose,
    onImpersonate,
    onBan,
    onDeleted,
}: {
    user: UserDetail | null;
    loading: boolean;
    onClose: () => void;
    onImpersonate: (userId: string) => void;
    onBan: (userId: string, isBanned: boolean) => void;
    onDeleted: () => void;
}) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        if (!user) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                onDeleted();
            } else {
                const error = await res.json();
                alert(error.message || 'Failed to delete user');
                setDeleting(false);
            }
        } catch {
            clientLogger.error('Failed to delete user');
            setDeleting(false);
        }
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-6">
                {loading ? (
                    <div className="py-12 text-center text-gray-400">Loading...</div>
                ) : !user ? (
                    <div className="py-12 text-center text-gray-400">User not found</div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center gap-4">
                                {user.image ? (
                                    <img src={user.image} alt="" className="h-14 w-14 rounded-full object-cover" />
                                ) : (
                                    <div className="h-14 w-14 rounded-full bg-blue-500/10 flex items-center justify-center">
                                        <span className="text-xl font-medium text-blue-400">
                                            {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-xl font-semibold text-white">{user.name || 'Unnamed'}</h2>
                                    <p className="text-gray-400">{user.email}</p>
                                    <div className="flex gap-2 mt-1">
                                        {user.isSuperAdmin && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                                                <Shield className="h-3 w-3" />
                                                Super Admin
                                            </span>
                                        )}
                                        {user.emailVerified && (
                                            <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                                                Verified
                                            </span>
                                        )}
                                        {user.twoFactorEnabled && (
                                            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                                                2FA
                                            </span>
                                        )}
                                        {user.bannedAt && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
                                                <Ban className="h-3 w-3" />
                                                Banned
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!user.isSuperAdmin && (
                                    <>
                                        <button
                                            onClick={() => onImpersonate(user.id)}
                                            className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20"
                                        >
                                            <Eye className="h-4 w-4" />
                                            Impersonate
                                        </button>
                                        <button
                                            onClick={() => onBan(user.id, !!user.bannedAt)}
                                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${user.bannedAt
                                                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                                : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                                                }`}
                                        >
                                            <Ban className="h-4 w-4" />
                                            {user.bannedAt ? 'Unban' : 'Ban'}
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteConfirm(true)}
                                            className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
                                            title="Delete user"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </>
                                )}
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
                                        <p className="font-medium text-red-400">Delete User?</p>
                                        <p className="text-sm text-red-200/70 mt-1">
                                            This will permanently delete this user and all their data, including sessions and organization memberships.
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

                        {/* Ban Warning */}
                        {user.bannedAt && (
                            <div className="mb-6 rounded-lg bg-orange-500/10 border border-orange-500/30 p-4">
                                <div className="flex items-start gap-3">
                                    <Ban className="h-5 w-5 text-orange-400 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-orange-400">User is Banned</p>
                                        {user.banReason && (
                                            <p className="text-sm text-orange-200/70 mt-1">Reason: {user.banReason}</p>
                                        )}
                                        <p className="text-xs text-orange-200/50 mt-1">
                                            Banned on {new Date(user.bannedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Info Cards */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400">Created</p>
                                <p className="text-white font-medium">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400">Workspaces</p>
                                <p className="text-white font-medium">{user.workspaces.length}</p>
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400">Organizations</p>
                                <p className="text-white font-medium">{user.organizations.length}</p>
                            </div>
                        </div>

                        {/* Workspaces */}
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <Briefcase className="h-4 w-4 text-gray-400" />
                                <h3 className="font-medium text-white">Workspaces</h3>
                            </div>
                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                                {user.workspaces.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-gray-500">No workspaces</p>
                                ) : (
                                    user.workspaces.map((w) => (
                                        <div key={w.id} className="flex items-center justify-between px-4 py-2">
                                            <div>
                                                <span className="text-sm text-white">{w.name}</span>
                                                <span className="text-xs text-gray-500 ml-2">/{w.slug}</span>
                                            </div>
                                            <span className="text-xs text-gray-500">{w.role}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Organizations */}
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <Building2 className="h-4 w-4 text-gray-400" />
                                <h3 className="font-medium text-white">Organizations</h3>
                            </div>
                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                                {user.organizations.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-gray-500">No organizations</p>
                                ) : (
                                    user.organizations.map((o) => (
                                        <div key={o.id} className="flex items-center justify-between px-4 py-2">
                                            <div>
                                                <span className="text-sm text-white">{o.name}</span>
                                                <span className="text-xs text-purple-400 ml-2">{o.tier}</span>
                                            </div>
                                            <span className="text-xs text-gray-500">{o.role}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Recent Sessions */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="h-4 w-4 text-gray-400" />
                                <h3 className="font-medium text-white">Recent Sessions</h3>
                            </div>
                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                                {user.recentSessions.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-gray-500">No sessions</p>
                                ) : (
                                    user.recentSessions.map((s) => (
                                        <div key={s.id} className="flex items-center justify-between px-4 py-2">
                                            <span className="text-sm text-white">{s.deviceName || 'Unknown device'}</span>
                                            <span className="text-xs text-gray-500">
                                                {new Date(s.lastUsedAt).toLocaleString()}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
