/**
 * Profile Selector Account Item
 * Individual account row in the profile selector.
 */

'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';
import { PlatformIcon } from './platform-icons';

export interface SocialAccount {
    id: string;
    platform: Platform;
    name: string;
    username?: string;
    avatar?: string;
    isActive: boolean;
    /** 
     * Optional organisation name for grouping accounts
     * If not provided, will be derived from account name
     */
    organisation?: string;
}

interface AccountItemProps {
    account: SocialAccount;
    isSelected: boolean;
    onToggle: () => void;
}

/**
 * Individual account item in the profile selector
 */
export function AccountItem({ account, isSelected, onToggle }: AccountItemProps) {
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
