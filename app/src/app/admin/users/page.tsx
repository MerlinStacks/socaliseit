'use client';

/**
 * Users Management Page
 * List, search, and manage all users
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, ChevronLeft, ChevronRight, Shield, ShieldOff } from 'lucide-react';

interface User {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    isSuperAdmin: boolean;
    emailVerified: string | null;
    workspaceCount: number;
    organizationCount: number;
    createdAt: string;
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
            console.error('Failed to fetch users:', error);
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
            console.error('Failed to toggle super admin:', error);
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
                                        <div className="flex items-center gap-3">
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
                                                <p className="font-medium text-white">{user.name || 'Unnamed'}</p>
                                                <p className="text-sm text-gray-500">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
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
                                        <button
                                            onClick={() => toggleSuperAdmin(user.id, user.isSuperAdmin)}
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
        </div>
    );
}
