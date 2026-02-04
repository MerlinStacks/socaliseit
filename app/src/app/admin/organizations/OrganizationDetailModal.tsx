'use client';

/**
 * Organization Detail Modal
 * Why: View/edit organization details, members, and workspaces
 */

import { useState, useEffect } from 'react';
import { Building2, X, Edit, Trash2, Users, Briefcase, AlertTriangle, UserPlus, ChevronDown, Search } from 'lucide-react';
import { OrganizationDetail, tierColors, TIERS, ORG_ROLES } from './types';

interface OrganizationDetailModalProps {
    organization: OrganizationDetail | null;
    loading: boolean;
    onClose: () => void;
    onUpdated: () => void;
    onDeleted: () => void;
}

export function OrganizationDetailModal({
    organization,
    loading,
    onClose,
    onUpdated,
    onDeleted,
}: OrganizationDetailModalProps) {
    const [editing, setEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editData, setEditData] = useState({
        name: '',
        tier: 'FREE' as typeof TIERS[number],
        maxWorkspaces: 1,
        maxMembers: 5,
    });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Member management state
    const [showAddMember, setShowAddMember] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string | null; email: string; image: string | null }>>([]);
    const [searching, setSearching] = useState(false);
    const [addingMember, setAddingMember] = useState(false);
    const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

    useEffect(() => {
        if (organization) {
            setEditData({
                name: organization.name,
                tier: organization.tier,
                maxWorkspaces: organization.maxWorkspaces,
                maxMembers: organization.maxMembers,
            });
        }
    }, [organization]);

    const handleSave = async () => {
        if (!organization) return;
        setSaving(true);

        try {
            const res = await fetch(`/api/admin/organizations/${organization.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editData),
            });

            if (res.ok) {
                setEditing(false);
                onUpdated();
            }
        } catch {
            console.error('Failed to update organization');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!organization) return;
        setDeleting(true);

        try {
            const res = await fetch(`/api/admin/organizations/${organization.id}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                onDeleted();
            }
        } catch {
            console.error('Failed to delete organization');
        } finally {
            setDeleting(false);
        }
    };

    /**
     * Search for users to add to the organization
     */
    const handleUserSearch = async (query: string) => {
        setUserSearch(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        try {
            const res = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            const existingUserIds = new Set(organization?.members.map(m => m.user.id) || []);
            setSearchResults(data.users?.filter((u: { id: string }) => !existingUserIds.has(u.id)) || []);
        } catch {
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    /**
     * Add a user to the organization
     */
    const handleAddMember = async (userId: string) => {
        if (!organization) return;
        setAddingMember(true);
        try {
            const res = await fetch(`/api/admin/organizations/${organization.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, role: 'MEMBER' }),
            });
            if (res.ok) {
                setShowAddMember(false);
                setUserSearch('');
                setSearchResults([]);
                onUpdated();
            }
        } catch {
            console.error('Failed to add member');
        } finally {
            setAddingMember(false);
        }
    };

    /**
     * Update a member's role
     */
    const handleUpdateRole = async (memberId: string, newRole: string) => {
        if (!organization) return;
        setUpdatingMemberId(memberId);
        try {
            const res = await fetch(`/api/admin/organizations/${organization.id}/members/${memberId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            if (res.ok) {
                onUpdated();
            }
        } catch {
            console.error('Failed to update role');
        } finally {
            setUpdatingMemberId(null);
        }
    };

    /**
     * Remove a member from the organization
     */
    const handleRemoveMember = async (memberId: string) => {
        if (!organization) return;
        setRemovingMemberId(memberId);
        try {
            const res = await fetch(`/api/admin/organizations/${organization.id}/members/${memberId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                onUpdated();
            }
        } catch {
            console.error('Failed to remove member');
        } finally {
            setRemovingMemberId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 p-6">
                {loading ? (
                    <div className="py-12 text-center text-gray-400">Loading...</div>
                ) : !organization ? (
                    <div className="py-12 text-center text-gray-400">Organization not found</div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                    <Building2 className="h-6 w-6 text-purple-400" />
                                </div>
                                <div>
                                    {editing ? (
                                        <input
                                            type="text"
                                            value={editData.name}
                                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                            className="text-xl font-semibold text-white bg-gray-800 border border-gray-700 rounded px-2 py-1"
                                        />
                                    ) : (
                                        <h2 className="text-xl font-semibold text-white">{organization.name}</h2>
                                    )}
                                    <p className="text-sm text-gray-500">/{organization.slug}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!editing && (
                                    <>
                                        <button
                                            onClick={() => setEditing(true)}
                                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
                                        >
                                            <Edit className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteConfirm(true)}
                                            className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </>
                                )}
                                <button onClick={onClose} className="text-gray-400 hover:text-white ml-2">
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
                                        <p className="font-medium text-red-400">Delete Organization?</p>
                                        <p className="text-sm text-red-200/70 mt-1">
                                            This will remove all members. Workspaces will become standalone.
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

                        {/* Settings */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400 mb-1">Tier</p>
                                {editing ? (
                                    <select
                                        value={editData.tier}
                                        onChange={(e) => setEditData({ ...editData, tier: e.target.value as typeof TIERS[number] })}
                                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-white"
                                    >
                                        {TIERS.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <p className={`text-lg font-medium ${tierColors[organization.tier].text}`}>
                                        {organization.tier}
                                    </p>
                                )}
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400 mb-1">Created</p>
                                <p className="text-lg font-medium text-white">
                                    {new Date(organization.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400 mb-1">Max Workspaces</p>
                                {editing ? (
                                    <input
                                        type="number"
                                        value={editData.maxWorkspaces}
                                        onChange={(e) => setEditData({ ...editData, maxWorkspaces: Number(e.target.value) })}
                                        min={1}
                                        max={100}
                                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-white"
                                    />
                                ) : (
                                    <p className="text-lg font-medium text-white">
                                        {organization.workspaceCount} / {organization.maxWorkspaces}
                                    </p>
                                )}
                            </div>
                            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                                <p className="text-sm text-gray-400 mb-1">Max Members</p>
                                {editing ? (
                                    <input
                                        type="number"
                                        value={editData.maxMembers}
                                        onChange={(e) => setEditData({ ...editData, maxMembers: Number(e.target.value) })}
                                        min={1}
                                        max={1000}
                                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-white"
                                    />
                                ) : (
                                    <p className="text-lg font-medium text-white">
                                        {organization.memberCount} / {organization.maxMembers}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Edit Actions */}
                        {editing && (
                            <div className="flex justify-end gap-2 mb-6">
                                <button
                                    onClick={() => setEditing(false)}
                                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}

                        {/* Members */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-gray-400" />
                                    <h3 className="font-medium text-white">Members ({organization.members.length})</h3>
                                </div>
                                <button
                                    onClick={() => setShowAddMember(true)}
                                    className="flex items-center gap-1.5 rounded-lg bg-purple-600/10 px-2.5 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/20 transition-colors"
                                >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    Add
                                </button>
                            </div>

                            {/* Add Member Panel */}
                            {showAddMember && (
                                <div className="mb-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                        <input
                                            type="text"
                                            value={userSearch}
                                            onChange={(e) => handleUserSearch(e.target.value)}
                                            placeholder="Search users by name or email..."
                                            className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                                            autoFocus
                                        />
                                    </div>
                                    {searching && <p className="mt-2 text-xs text-gray-400">Searching...</p>}
                                    {searchResults.length > 0 && (
                                        <div className="mt-2 rounded-lg border border-gray-700 bg-gray-800 divide-y divide-gray-700 max-h-32 overflow-y-auto">
                                            {searchResults.map((user) => (
                                                <button
                                                    key={user.id}
                                                    onClick={() => handleAddMember(user.id)}
                                                    disabled={addingMember}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                                                >
                                                    <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                        <span className="text-xs text-blue-400">
                                                            {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-white truncate">{user.name || 'Unnamed'}</p>
                                                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {userSearch.length >= 2 && !searching && searchResults.length === 0 && (
                                        <p className="mt-2 text-xs text-gray-500">No users found</p>
                                    )}
                                    <button
                                        onClick={() => { setShowAddMember(false); setUserSearch(''); setSearchResults([]); }}
                                        className="mt-2 text-xs text-gray-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-48 overflow-y-auto">
                                {organization.members.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-gray-500">No members</p>
                                ) : (
                                    organization.members.map((m) => (
                                        <div key={m.id} className="flex items-center justify-between px-4 py-2 group">
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                    <span className="text-xs text-blue-400">
                                                        {m.user.name?.charAt(0) || m.user.email.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <span className="text-sm text-white">{m.user.name || m.user.email}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {/* Role Dropdown */}
                                                <div className="relative">
                                                    <select
                                                        value={m.role}
                                                        onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                                                        disabled={updatingMemberId === m.id}
                                                        className="appearance-none rounded border border-gray-700 bg-gray-800 pl-2 pr-6 py-1 text-xs text-gray-300 focus:border-purple-500 focus:outline-none cursor-pointer disabled:opacity-50"
                                                    >
                                                        {ORG_ROLES.map((role) => (
                                                            <option key={role} value={role}>{role}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500 pointer-events-none" />
                                                </div>
                                                {/* Remove Button */}
                                                <button
                                                    onClick={() => handleRemoveMember(m.id)}
                                                    disabled={removingMemberId === m.id}
                                                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all disabled:opacity-50"
                                                    title="Remove member"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Workspaces */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Briefcase className="h-4 w-4 text-gray-400" />
                                <h3 className="font-medium text-white">Workspaces ({organization.workspaces.length})</h3>
                            </div>
                            <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 max-h-40 overflow-y-auto">
                                {organization.workspaces.length === 0 ? (
                                    <p className="px-4 py-3 text-sm text-gray-500">No workspaces</p>
                                ) : (
                                    organization.workspaces.map((w) => (
                                        <div key={w.id} className="flex items-center justify-between px-4 py-2">
                                            <div>
                                                <span className="text-sm text-white">{w.name}</span>
                                                <span className="text-xs text-gray-500 ml-2">/{w.slug}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {w.memberCount} members · {w.postCount} posts
                                            </div>
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
