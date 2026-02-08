'use client';

/**
 * Organization Switcher Component
 * Allows users to switch between organizations they belong to.
 * Displays in the sidebar when user has multiple organizations.
 */

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';

interface Organization {
    id: string;
    name: string;
    slug: string;
    role: string;
}

interface OrganizationSwitcherProps {
    /** Whether to show the full name or just icon when collapsed */
    isExpanded?: boolean;
}

/**
 * Dropdown component for switching between organizations.
 * Only renders when user has multiple organizations.
 */
export function OrganizationSwitcher({ isExpanded = true }: OrganizationSwitcherProps) {
    const { data: session, update: updateSession } = useSession();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const organizations = (session?.user?.organizations as Organization[]) || [];
    const currentOrgId = session?.user?.currentOrganizationId;
    const currentOrg = organizations.find((org) => org.id === currentOrgId);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Don't render if user has only one organization
    if (organizations.length <= 1) {
        return null;
    }

    /**
     * Switches to the selected organization.
     * Calls API to persist preference and refreshes page to reload data.
     */
    async function handleSwitch(orgId: string) {
        if (orgId === currentOrgId || isLoading) return;

        setIsLoading(true);
        try {
            const response = await fetch('/api/organizations/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: orgId }),
            });

            if (!response.ok) {
                throw new Error('Failed to switch organization');
            }

            // Update session and reload to reflect new org data
            await updateSession();
            setIsOpen(false);

            // Hard refresh to ensure all data is fetched for the new org
            router.refresh();
            window.location.reload();
        } catch (error) {
            showErrorToast(error, 'Failed to switch organization');
        } finally {
            setIsLoading(false);
        }
    }

    /**
     * Maps role to display badge color
     */
    function getRoleBadgeStyles(role: string): string {
        switch (role.toUpperCase()) {
            case 'OWNER':
                return 'bg-amber-500/20 text-amber-400';
            case 'ADMIN':
                return 'bg-purple-500/20 text-purple-400';
            case 'MEMBER':
                return 'bg-blue-500/20 text-blue-400';
            case 'VIEWER':
                return 'bg-gray-500/20 text-gray-400';
            default:
                return 'bg-gray-500/20 text-gray-400';
        }
    }

    return (
        <div ref={dropdownRef} className="relative px-2">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isLoading}
                title={!isExpanded ? currentOrg?.name : undefined}
                className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2',
                    'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80',
                    'border border-[var(--border)] transition-colors',
                    'text-left text-sm font-medium text-[var(--text-primary)]',
                    isLoading && 'opacity-50 cursor-wait'
                )}
            >
                <Building2 className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" />
                {isExpanded && (
                    <>
                        <span className="flex-1 truncate">{currentOrg?.name || 'Select Organization'}</span>
                        <ChevronDown
                            className={cn(
                                'h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform',
                                isOpen && 'rotate-180'
                            )}
                        />
                    </>
                )}
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    className={cn(
                        'absolute left-2 right-2 top-full z-50 mt-1',
                        'rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]',
                        'shadow-xl shadow-black/20',
                        'max-h-64 overflow-y-auto'
                    )}
                >
                    <div className="p-1">
                        {organizations.map((org) => {
                            const isActive = org.id === currentOrgId;
                            return (
                                <button
                                    key={org.id}
                                    onClick={() => handleSwitch(org.id)}
                                    disabled={isLoading}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-3 py-2',
                                        'text-left text-sm transition-colors',
                                        isActive
                                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                    )}
                                >
                                    {isActive ? (
                                        <Check className="h-4 w-4 shrink-0" />
                                    ) : (
                                        <div className="h-4 w-4 shrink-0" />
                                    )}
                                    <span className="flex-1 truncate">{org.name}</span>
                                    <span
                                        className={cn(
                                            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                            getRoleBadgeStyles(org.role)
                                        )}
                                    >
                                        {org.role}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
