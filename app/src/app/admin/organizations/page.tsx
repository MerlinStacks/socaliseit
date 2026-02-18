'use client';

/**
 * Organizations Management Page
 * List, search, and manage all organizations
 * 
 * Why: Super admin needs to manage all organizations on the platform
 * 
 * Decomposition Summary:
 * - Original: 934 lines
 * - Extracted: types.ts, CreateOrganizationModal.tsx, OrganizationDetailModal.tsx
 * - This file: ~180 lines (thin orchestrator)
 */

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Organization, OrganizationDetail, Pagination, tierColors } from './types';
import { CreateOrganizationModal } from './CreateOrganizationModal';
import { OrganizationDetailModal } from './OrganizationDetailModal';
import { clientLogger } from '@/lib/client-logger';

export default function OrganizationsPage() {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [search, setSearch] = useState('');
    const [tierFilter, setTierFilter] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState<OrganizationDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const fetchOrganizations = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(search && { search }),
                ...(tierFilter && { tier: tierFilter }),
            });

            const res = await fetch(`/api/admin/organizations?${params}`);
            const data = await res.json();

            setOrganizations(data.organizations);
            setPagination(data.pagination);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch organizations');
        } finally {
            setLoading(false);
        }
    }, [pagination.page, search, tierFilter]);

    useEffect(() => {
        fetchOrganizations();
    }, [fetchOrganizations]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPagination((prev) => ({ ...prev, page: 1 }));
        fetchOrganizations();
    };

    const openOrgDetail = async (orgId: string) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/admin/organizations/${orgId}`);
            const data = await res.json();
            setSelectedOrg(data.organization);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch organization details');
        } finally {
            setLoadingDetail(false);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Organizations</h1>
                    <p className="text-gray-400 mt-1">
                        Manage enterprise accounts and their tiers
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Create Organization
                </button>
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
                            placeholder="Search organizations..."
                            className="w-full rounded-lg border border-gray-800 bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                </form>
                <select
                    value={tierFilter}
                    onChange={(e) => {
                        setTierFilter(e.target.value);
                        setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                >
                    <option value="">All Tiers</option>
                    <option value="FREE">Free</option>
                    <option value="PRO">Pro</option>
                    <option value="BUSINESS">Business</option>
                    <option value="ENTERPRISE">Enterprise</option>
                </select>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-800">
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Organization
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Tier
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Members
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Workspaces
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                Created
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                    Loading...
                                </td>
                            </tr>
                        ) : organizations.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center">
                                    <Building2 className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                                    <p className="text-gray-400">No organizations found</p>
                                </td>
                            </tr>
                        ) : (
                            organizations.map((org) => {
                                const tierStyle = tierColors[org.tier];
                                return (
                                    <tr
                                        key={org.id}
                                        onClick={() => openOrgDetail(org.id)}
                                        className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                                    <Building2 className="h-5 w-5 text-purple-400" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{org.name}</p>
                                                    <p className="text-sm text-gray-500">/{org.slug}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tierStyle.bg} ${tierStyle.text}`}>
                                                {org.tier}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {org.memberCount} / {org.maxMembers}
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {org.workspaceCount} / {org.maxWorkspaces}
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 text-sm">
                                            {new Date(org.createdAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })
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

            {/* Create Organization Modal */}
            {showCreateModal && (
                <CreateOrganizationModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        fetchOrganizations();
                    }}
                />
            )}

            {/* Organization Detail Modal */}
            {(selectedOrg || loadingDetail) && (
                <OrganizationDetailModal
                    organization={selectedOrg}
                    loading={loadingDetail}
                    onClose={() => setSelectedOrg(null)}
                    onUpdated={() => {
                        setSelectedOrg(null);
                        fetchOrganizations();
                    }}
                    onDeleted={() => {
                        setSelectedOrg(null);
                        fetchOrganizations();
                    }}
                />
            )}
        </div>
    );
}
