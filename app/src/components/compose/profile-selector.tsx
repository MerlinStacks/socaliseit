/**
 * Profile Selector Component
 * Left sidebar for multi-account selection in the composer
 */

'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';
import { PlatformIcon } from './platform-icons';
import { AccountItem, type SocialAccount } from './account-item';

// Re-export types for external consumers
export type { SocialAccount } from './account-item';
export { PlatformIcon } from './platform-icons';

interface AccountGroup {
    name: string;
    accounts: SocialAccount[];
    /** Platform icons to show for this group */
    platforms: Platform[];
}

interface ProfileSelectorProps {
    accounts: SocialAccount[];
    selected: string[];
    onSelectionChange: (ids: string[]) => void;
    /** How to group accounts: by platform, organisation, or all in one group */
    groupBy?: 'platform' | 'organisation' | 'organization';
    className?: string;
}

/**
 * Extract organisation name from account
 * Why: Accounts in same org share grouping; uses Organization relation
 */
function getOrganisationName(account: SocialAccount): string {
    if (account.organization?.name) return account.organization.name;
    return account.name;
}

/**
 * Multi-account selector with grouping, search, and platform icons
 * Why: Enables users to select multiple accounts across different platforms
 * for cross-posting content simultaneously
 */
export function ProfileSelector({
    accounts,
    selected,
    onSelectionChange,
    groupBy = 'organisation',
    className,
}: ProfileSelectorProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all']));

    // Filter accounts by search query
    const filteredAccounts = useMemo(() => {
        if (!searchQuery.trim()) return accounts;
        const query = searchQuery.toLowerCase();
        return accounts.filter(
            (account) =>
                account.name.toLowerCase().includes(query) ||
                account.username?.toLowerCase().includes(query) ||
                account.platform.toLowerCase().includes(query) ||
                account.organization?.name?.toLowerCase().includes(query)
        );
    }, [accounts, searchQuery]);

    // Group accounts
    const groups = useMemo((): AccountGroup[] => {
        if (groupBy === 'platform') {
            const platformGroups: Record<string, SocialAccount[]> = {};
            filteredAccounts.forEach((account) => {
                const key = account.platform;
                if (!platformGroups[key]) platformGroups[key] = [];
                platformGroups[key].push(account);
            });
            return Object.entries(platformGroups).map(([platform, accts]) => ({
                name: PLATFORM_SPECS[platform as Platform]?.name || platform,
                accounts: accts,
                platforms: [platform as Platform],
            }));
        }

        if (groupBy === 'organisation') {
            const orgGroups: Record<string, SocialAccount[]> = {};
            filteredAccounts.forEach((account) => {
                const orgName = getOrganisationName(account);
                if (!orgGroups[orgName]) orgGroups[orgName] = [];
                orgGroups[orgName].push(account);
            });
            return Object.entries(orgGroups).map(([orgName, accts]) => {
                const platforms = [...new Set(accts.map(a => a.platform))];
                return { name: orgName, accounts: accts, platforms };
            });
        }

        // Default: single group with all accounts
        const allPlatforms = [...new Set(filteredAccounts.map(a => a.platform))];
        return [{ name: 'All Profiles', accounts: filteredAccounts, platforms: allPlatforms }];
    }, [filteredAccounts, groupBy]);

    const toggleAccount = (accountId: string) => {
        if (selected.includes(accountId)) {
            onSelectionChange(selected.filter((id) => id !== accountId));
        } else {
            onSelectionChange([...selected, accountId]);
        }
    };

    const toggleGroup = (groupName: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupName)) {
            newExpanded.delete(groupName);
        } else {
            newExpanded.add(groupName);
        }
        setExpandedGroups(newExpanded);
    };

    const selectAllInGroup = (group: AccountGroup) => {
        const groupIds = group.accounts.map((a) => a.id);
        const allSelected = groupIds.every((id) => selected.includes(id));
        if (allSelected) {
            onSelectionChange(selected.filter((id) => !groupIds.includes(id)));
        } else {
            const newSelected = new Set([...selected, ...groupIds]);
            onSelectionChange(Array.from(newSelected));
        }
    };

    // Get unique platforms from selected accounts
    const selectedPlatforms = useMemo(() => {
        const platforms = new Set<Platform>();
        accounts.forEach((account) => {
            if (selected.includes(account.id)) {
                platforms.add(account.platform);
            }
        });
        return Array.from(platforms);
    }, [accounts, selected]);

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-secondary)]', className)}>
            {/* Header */}
            <div className="border-b border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Select Profiles</h3>
                    <span className="rounded-full bg-[var(--accent-gold-light)] px-2 py-0.5 text-xs font-medium text-[var(--accent-gold)]">
                        {selected.length}
                    </span>
                </div>

                {/* Search */}
                <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search profiles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-9 pr-3 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-gold)]"
                    />
                </div>
            </div>

            {/* Account Groups */}
            <div className="flex-1 overflow-y-auto p-2">
                {groups.map((group) => {
                    const isExpanded = expandedGroups.has(group.name) || expandedGroups.has('all');
                    const groupIds = group.accounts.map((a) => a.id);
                    const selectedCount = groupIds.filter((id) => selected.includes(id)).length;
                    const allSelected = selectedCount === group.accounts.length && group.accounts.length > 0;

                    return (
                        <div key={group.name} className="mb-2">
                            {/* Group Header */}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleGroup(group.name)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleGroup(group.name);
                                    }
                                }}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                                {/* Show platform icons for organisation grouping */}
                                {groupBy === 'organisation' && group.platforms && (
                                    <div className="flex items-center gap-1">
                                        {group.platforms.slice(0, 4).map((platform) => (
                                            <PlatformIcon key={platform} platform={platform} size={14} className="text-[var(--text-muted)]" />
                                        ))}
                                        {group.platforms.length > 4 && (
                                            <span className="text-xs text-[var(--text-muted)]">+{group.platforms.length - 4}</span>
                                        )}
                                    </div>
                                )}
                                <span className="flex-1 truncate">{group.name}</span>
                                {selectedCount > 0 && (
                                    <span className="text-xs text-[var(--text-muted)]">
                                        {selectedCount}/{group.accounts.length}
                                    </span>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        selectAllInGroup(group);
                                    }}
                                    className={cn(
                                        'flex h-5 w-5 items-center justify-center rounded border',
                                        allSelected
                                            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)] text-white'
                                            : 'border-[var(--border)] bg-[var(--bg-tertiary)]'
                                    )}
                                >
                                    {allSelected && <Check className="h-3 w-3" />}
                                </button>
                            </div>

                            {/* Account List */}
                            {isExpanded && (
                                <div className="ml-2 space-y-1">
                                    {group.accounts.map((account) => (
                                        <AccountItem
                                            key={account.id}
                                            account={account}
                                            isSelected={selected.includes(account.id)}
                                            onToggle={() => toggleAccount(account.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredAccounts.length === 0 && (
                    <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                        {searchQuery ? 'No profiles match your search' : 'No connected profiles'}
                    </div>
                )}
            </div>

            {/* Selected Platforms Summary */}
            {selectedPlatforms.length > 0 && (
                <div className="border-t border-[var(--border)] p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        Selected platforms
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {selectedPlatforms.map((platform) => {
                            const spec = PLATFORM_SPECS[platform];
                            return (
                                <div
                                    key={platform}
                                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium"
                                    style={{ backgroundColor: `${spec.color}20`, color: spec.color }}
                                >
                                    <PlatformIcon platform={platform} size={14} />
                                    {spec.name}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
