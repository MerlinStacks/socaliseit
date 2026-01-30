/**
 * Profile Selector Component
 * Left sidebar for multi-account selection in the composer
 */

'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';

export interface SocialAccount {
    id: string;
    platform: Platform;
    name: string;
    username?: string;
    avatar?: string;
    isActive: boolean;
}

interface AccountGroup {
    name: string;
    accounts: SocialAccount[];
}

interface ProfileSelectorProps {
    accounts: SocialAccount[];
    selected: string[];
    onSelectionChange: (ids: string[]) => void;
    groupBy?: 'platform' | 'workspace';
    className?: string;
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
    groupBy = 'platform',
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
                account.platform.toLowerCase().includes(query)
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
            }));
        }
        // Default: single group with all accounts
        return [{ name: 'All Profiles', accounts: filteredAccounts }];
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
                                <span className="flex-1">{group.name}</span>
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

interface AccountItemProps {
    account: SocialAccount;
    isSelected: boolean;
    onToggle: () => void;
}

function AccountItem({ account, isSelected, onToggle }: AccountItemProps) {
    const spec = PLATFORM_SPECS[account.platform];

    return (
        <button
            onClick={onToggle}
            className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                isSelected
                    ? 'bg-[var(--accent-gold-light)] border border-[var(--accent-gold)]'
                    : 'hover:bg-[var(--bg-tertiary)] border border-transparent'
            )}
        >
            {/* Avatar */}
            <div className="relative">
                {account.avatar ? (
                    <img
                        src={account.avatar}
                        alt={account.name}
                        className="h-8 w-8 rounded-full object-cover"
                    />
                ) : (
                    <div
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold"
                        style={{ backgroundColor: spec.color }}
                    >
                        {account.name.charAt(0).toUpperCase()}
                    </div>
                )}
                {/* Platform badge */}
                <div
                    className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
                    style={{ backgroundColor: spec.color }}
                >
                    <PlatformIcon platform={account.platform} size={10} className="text-white" />
                </div>
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {account.name}
                </div>
                {account.username && (
                    <div className="truncate text-xs text-[var(--text-muted)]">
                        @{account.username}
                    </div>
                )}
            </div>

            {/* Checkbox */}
            <div
                className={cn(
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors',
                    isSelected
                        ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)] text-white'
                        : 'border-[var(--border)] bg-[var(--bg-tertiary)]'
                )}
            >
                {isSelected && <Check className="h-3 w-3" />}
            </div>
        </button>
    );
}

interface PlatformIconProps {
    platform: Platform;
    size?: number;
    className?: string;
}

/**
 * SVG icons for social platforms
 */
export function PlatformIcon({ platform, size = 16, className }: PlatformIconProps) {
    const iconProps = { width: size, height: size, className };

    switch (platform) {
        case 'instagram':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
            );
        case 'facebook':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
            );
        case 'tiktok':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
            );
        case 'youtube':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
            );
        case 'pinterest':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
                </svg>
            );
        case 'linkedin':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            );
        case 'bluesky':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.296 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
                </svg>
            );
        case 'google_business':
            return (
                <svg {...iconProps} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                </svg>
            );
        default:
            return null;
    }
}
