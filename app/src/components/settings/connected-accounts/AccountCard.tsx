'use client';

/**
 * Account Card Component
 * Why: Displays a connected social account with status, organization, and actions.
 */

import { Facebook, ExternalLink, Trash2, Check, Edit2, Save, X, RefreshCw } from 'lucide-react';
import { InlineErrorBadge } from '@/components/ui/error-message';
import { PLATFORM_CONFIG, getProfileUrl, type PlatformId } from './platform-config';
import { isTokenExpiring, isTokenExpired } from './use-connected-accounts';
import type { SocialAccount, Organization } from './types';

interface AccountCardProps {
    account: SocialAccount;
    organizations: Organization[];
    loadingOrgs: boolean;
    editingOrg: string | null;
    selectedOrgId: string | null;
    reconnecting: string | null;
    onEditOrg: (accountId: string) => void;
    onCancelEditOrg: () => void;
    onSaveOrg: (accountId: string) => void;
    onSelectOrgId: (orgId: string | null) => void;
    onReconnect: (accountId: string, platform: string) => void;
    onDelete: (accountId: string) => void;
    onFetchOrganizations: () => void;
}

export function AccountCard({
    account,
    organizations,
    loadingOrgs,
    editingOrg,
    selectedOrgId,
    reconnecting,
    onEditOrg,
    onCancelEditOrg,
    onSaveOrg,
    onSelectOrgId,
    onReconnect,
    onDelete,
    onFetchOrganizations,
}: AccountCardProps) {
    const config = PLATFORM_CONFIG[account.platform.toLowerCase() as PlatformId];
    const isManual = account.platform.toLowerCase() === 'manual';
    // Why: isActive is set to false by markAccountForReconnection() when a token refresh
    // fails permanently. This catches cases where tokenExpiry is null (e.g. TikTok)
    // but the account was deactivated after the API rejected the stale token.
    const deactivated = !isManual && account.isActive === false;
    // Why: Bluesky accessJwt only lives 2 hours but auto-refreshes via refreshSession.
    // The 7-day isTokenExpiring threshold would permanently flag it. Only show
    // warnings for Bluesky when isActive is false (refresh actually failed).
    const isBluesky = account.platform.toLowerCase() === 'bluesky';
    const expiring = !isManual && (deactivated || (!isBluesky && isTokenExpiring(account.tokenExpiry)));
    const expired = !isManual && (deactivated || (!isBluesky && isTokenExpired(account.tokenExpiry)));
    const Icon = config?.icon || Facebook;
    const profileUrl = isManual ? null : getProfileUrl(account.platform, account.username);

    /** Display name: prefer customPlatformName for manual accounts */
    const platformLabel = isManual && account.customPlatformName
        ? account.customPlatformName
        : (config?.name || account.platform.toLowerCase());

    return (
        <div className="card flex flex-col p-4 gap-3">
            {/* Top row: icon + status */}
            <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${config?.iconBg || 'bg-[var(--bg-tertiary)]'}`}>
                    <Icon className="h-5 w-5" />
                </div>

                {/* Status Badge */}
                {expiring ? (
                    expired ? (
                        <InlineErrorBadge
                            type="error"
                            label="Expired"
                            action={{
                                label: "Reconnect",
                                onClick: () => onReconnect(account.id, account.platform),
                                loading: reconnecting === account.id
                            }}
                        />
                    ) : (
                        <InlineErrorBadge
                            type="warning"
                            label="Expiring Soon"
                            action={{
                                label: "Reconnect",
                                onClick: () => onReconnect(account.id, account.platform),
                                loading: reconnecting === account.id
                            }}
                        />
                    )
                ) : isManual ? (
                    <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-400">
                        <Check className="h-3 w-3" />
                        Reminder
                    </span>
                ) : (
                    <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-2 py-1 text-xs font-medium text-[var(--success)]">
                        <Check className="h-3 w-3" />
                        Connected
                    </span>
                )}
            </div>

            {/* Account Info */}
            <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{account.name}</p>
                <p className="text-sm text-[var(--text-muted)] truncate">
                    {isManual
                        ? platformLabel
                        : (account.username ? `@${account.username}` : account.platform.toLowerCase())}
                </p>

                {/* Organization selection */}
                {editingOrg === account.id ? (
                    <div className="flex items-center gap-2 mt-2">
                        <select
                            value={selectedOrgId || ''}
                            onChange={(e) => onSelectOrgId(e.target.value || null)}
                            className="h-8 text-sm flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 outline-none focus:border-[var(--accent-gold)]"
                            autoFocus
                        >
                            <option value="">No organization</option>
                            {loadingOrgs ? (
                                <option disabled>Loading...</option>
                            ) : (
                                organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))
                            )}
                        </select>
                        <button
                            onClick={() => onSaveOrg(account.id)}
                            className="rounded-lg p-1.5 text-[var(--success)] hover:bg-[var(--success-light)]"
                            title="Save"
                        >
                            <Save className="h-4 w-4" />
                        </button>
                        <button
                            onClick={onCancelEditOrg}
                            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                            title="Cancel"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            onEditOrg(account.id);
                            onSelectOrgId(account.organizationId);
                            onFetchOrganizations();
                        }}
                        className="flex items-center gap-1 mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                    >
                        <Edit2 className="h-3 w-3" />
                        {account.organization ? (
                            <span>Org: <span className="text-[var(--text-secondary)]">{account.organization.name}</span></span>
                        ) : (
                            <span>Set organization for grouping</span>
                        )}
                    </button>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 border-t border-[var(--border)] pt-3 mt-auto">
                {!isManual && profileUrl && (
                    <button
                        onClick={() => window.open(profileUrl, '_blank')}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                        title="Open profile"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </button>
                )}
                {!isManual && (
                    <button
                        onClick={() => onReconnect(account.id, account.platform)}
                        disabled={reconnecting === account.id}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--accent-gold)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                        title="Reconnect account"
                    >
                        <RefreshCw className={`h-4 w-4 ${reconnecting === account.id ? 'animate-spin' : ''}`} />
                    </button>
                )}
                <div className="flex-1" />
                <button
                    onClick={() => onDelete(account.id)}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--error)]"
                    title="Disconnect"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
