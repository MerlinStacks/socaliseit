/**
 * Mobile Organization Switcher
 * Bottom-sheet based org picker for mobile PWA users
 *
 * Why: The desktop OrganizationSwitcher lives in the sidebar which is
 * hidden on mobile (md:hidden). This component provides the same
 * functionality using mobile-native patterns (bottom sheet + haptics).
 */

'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';
import { triggerHaptic } from '@/hooks/use-haptic';
import { MobileBottomSheet } from './mobile-bottom-sheet';

interface Organization {
    id: string;
    name: string;
    slug: string;
    role: string;
}

/**
 * Maps role to display badge color.
 * Why: Consistent with desktop switcher styling for role visibility.
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

/**
 * Compact org switcher rendered above the mobile bottom nav icons.
 * Only visible when the user belongs to multiple organisations.
 */
export function MobileOrganizationSwitcher() {
    const { data: session, update: updateSession } = useSession();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const organizations = (session?.user?.organizations as Organization[]) || [];
    const currentOrgId = session?.user?.currentOrganizationId;
    const currentOrg = organizations.find((org) => org.id === currentOrgId);

    // Don't render if user has only one organization
    if (organizations.length <= 1) {
        return null;
    }

    /**
     * Switches to the selected organization.
     * Why: Reuses the same API endpoint as the desktop switcher so
     * server-side session state stays consistent across platforms.
     */
    async function handleSwitch(orgId: string) {
        if (orgId === currentOrgId || isLoading) return;

        setIsLoading(true);
        triggerHaptic('medium');

        try {
            const response = await fetch('/api/organizations/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: orgId }),
            });

            if (!response.ok) {
                throw new Error('Failed to switch organization');
            }

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

    return (
        <>
            {/* Trigger bar — sits above the nav icon row */}
            <button
                onClick={() => {
                    triggerHaptic('light');
                    setIsOpen(true);
                }}
                disabled={isLoading}
                className={cn(
                    'flex w-full items-center justify-center gap-2 px-4 py-2',
                    'border-b border-[var(--border)]',
                    'text-xs font-medium text-[var(--text-secondary)]',
                    'active:bg-[var(--bg-tertiary)] transition-colors',
                    isLoading && 'opacity-50 cursor-wait'
                )}
            >
                <Building2 className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
                <span className="truncate max-w-[200px]">
                    {currentOrg?.name || 'Select Organization'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </button>

            {/* Bottom sheet with org list */}
            <MobileBottomSheet
                open={isOpen}
                onClose={() => setIsOpen(false)}
                title="Switch Organization"
                snapPoints={[45, 70]}
            >
                <div className="px-4 py-2 space-y-1">
                    {organizations.map((org) => {
                        const isActive = org.id === currentOrgId;
                        return (
                            <button
                                key={org.id}
                                onClick={() => handleSwitch(org.id)}
                                disabled={isLoading}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-xl px-4 py-3',
                                    'text-left text-sm transition-colors',
                                    'active:scale-[0.98] transform',
                                    isActive
                                        ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] active:bg-[var(--bg-tertiary)]'
                                )}
                            >
                                {isActive ? (
                                    <Check className="h-5 w-5 shrink-0" />
                                ) : (
                                    <Building2 className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                                )}
                                <span className="flex-1 truncate font-medium">
                                    {org.name}
                                </span>
                                <span
                                    className={cn(
                                        'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase',
                                        getRoleBadgeStyles(org.role)
                                    )}
                                >
                                    {org.role}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </MobileBottomSheet>
        </>
    );
}
