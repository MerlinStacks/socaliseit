/**
 * Team Management Page
 * Manage team members and permissions - now with real database integration
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Users, Plus, Mail, Shield,
    Trash2, ChevronDown, Loader2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamMember {
    id: string;
    userId: string;
    name: string;
    email: string;
    avatar: string | null;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    status: 'active' | 'pending';
    joinedAt: string;
}

export default function TeamPage() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [editingRole, setEditingRole] = useState<string | null>(null);

    const fetchMembers = useCallback(async () => {
        try {
            const response = await fetch('/api/team');
            if (!response.ok) throw new Error('Failed to fetch team');
            const data = await response.json();
            setMembers(data.members);
        } catch (error) {
            console.error('Error fetching team:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    /**
     * Change member role
     */
    const handleRoleChange = async (memberId: string, newRole: string) => {
        try {
            const response = await fetch('/api/team', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId, role: newRole })
            });
            if (!response.ok) throw new Error('Failed to update role');

            setMembers(prev => prev.map(m =>
                m.id === memberId ? { ...m, role: newRole as TeamMember['role'] } : m
            ));
        } catch (error) {
            console.error('Error updating role:', error);
        }
        setEditingRole(null);
    };

    /**
     * Remove team member
     */
    const handleRemove = async (memberId: string) => {
        if (!confirm('Are you sure you want to remove this team member?')) return;

        try {
            const response = await fetch(`/api/team?id=${memberId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to remove member');
            setMembers(prev => prev.filter(m => m.id !== memberId));
        } catch (error) {
            console.error('Error removing member:', error);
        }
    };

    const roleLabels: Record<string, string> = {
        owner: 'Owner',
        admin: 'Admin',
        member: 'Member',
        viewer: 'Viewer',
    };

    const roleColors: Record<string, string> = {
        owner: 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]',
        admin: 'bg-purple-500/10 text-purple-500',
        member: 'bg-[var(--info)]/10 text-[var(--info)]',
        viewer: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]',
    };

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Team</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Manage team members and permissions
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowInviteModal(true)}>
                    <Plus className="h-4 w-4" />
                    Invite Member
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    </div>
                ) : (
                    <div className="mx-auto max-w-4xl">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                            {members.map((member, index) => (
                                <div
                                    key={member.id}
                                    className={cn(
                                        'flex items-center justify-between p-4',
                                        index > 0 && 'border-t border-[var(--border)]'
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        {member.avatar ? (
                                            <img
                                                src={member.avatar}
                                                alt={member.name}
                                                className="h-10 w-10 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                                                {member.name?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-medium">{member.name || 'Unnamed'}</p>
                                            <p className="text-sm text-[var(--text-muted)]">{member.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Role selector */}
                                        <div className="relative">
                                            {member.role === 'owner' ? (
                                                <span className={cn('px-3 py-1.5 rounded-full text-sm font-medium', roleColors[member.role])}>
                                                    <Shield className="inline h-3 w-3 mr-1" />
                                                    {roleLabels[member.role]}
                                                </span>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => setEditingRole(editingRole === member.id ? null : member.id)}
                                                        className={cn(
                                                            'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                                                            roleColors[member.role]
                                                        )}
                                                    >
                                                        {roleLabels[member.role]}
                                                        <ChevronDown className="h-3 w-3" />
                                                    </button>

                                                    {editingRole === member.id && (
                                                        <div className="absolute right-0 top-full mt-1 z-10 w-32 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg">
                                                            {['admin', 'member', 'viewer'].map((role) => (
                                                                <button
                                                                    key={role}
                                                                    onClick={() => handleRoleChange(member.id, role)}
                                                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
                                                                >
                                                                    {roleLabels[role]}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Remove button (not for owner) */}
                                        {member.role !== 'owner' && (
                                            <button
                                                onClick={() => handleRemove(member.id)}
                                                className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
                            {members.length} team member{members.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                )}
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <InviteModal
                    onClose={() => setShowInviteModal(false)}
                    onInvited={(newMember) => {
                        setMembers(prev => [...prev, newMember]);
                        setShowInviteModal(false);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Modal for inviting team members
 */
function InviteModal({
    onClose,
    onInvited
}: {
    onClose: () => void;
    onInvited: (member: TeamMember) => void;
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('member');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role })
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to invite member');
                return;
            }

            onInvited({
                id: data.id,
                userId: data.id,
                name: data.name || '',
                email: data.email,
                avatar: data.avatar,
                role: data.role,
                status: 'active',
                joinedAt: new Date().toISOString()
            });
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Invite Team Member</h2>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="colleague@company.com"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Role</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="admin">Admin - Full access</option>
                            <option value="member">Member - Create & edit content</option>
                            <option value="viewer">Viewer - View only</option>
                        </select>
                    </div>

                    {error && (
                        <p className="text-sm text-[var(--error)]">{error}</p>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !email}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                            Send Invite
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
