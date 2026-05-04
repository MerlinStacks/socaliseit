'use client';

/**
 * Connected Accounts Hook
 * Why: Centralizes state management and API calls for connected accounts.
 * Follows the 200-line standard decomposition pattern.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SocialAccount, Organization, GbpLocation, GbpPendingData, MetaAccountOption } from './types';
import { showErrorToast } from '@/lib/api-error';

export function useConnectedAccounts() {
    // Core accounts state
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [reconnecting, setReconnecting] = useState<string | null>(null);

    // Organization selection state
    const [editingOrg, setEditingOrg] = useState<string | null>(null);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loadingOrgs, setLoadingOrgs] = useState(false);

    // Modal visibility state
    const [showAddModal, setShowAddModal] = useState(false);
    const [showBlueskyModal, setShowBlueskyModal] = useState(false);
    const [showManualModal, setShowManualModal] = useState(false);
    const [showGbpLocationPicker, setShowGbpLocationPicker] = useState(false);

    // Bluesky session auth state
    const [blueskyHandle, setBlueskyHandle] = useState('');
    const [blueskyAppPassword, setBlueskyAppPassword] = useState('');
    const [blueskyError, setBlueskyError] = useState<string | null>(null);



    // Google Business location picker state
    const [gbpPendingData, setGbpPendingData] = useState<GbpPendingData | null>(null);
    const [gbpLocations, setGbpLocations] = useState<GbpLocation[]>([]);
    const [gbpLoadingLocations, setGbpLoadingLocations] = useState(false);
    const [gbpConnecting, setGbpConnecting] = useState<string | null>(null);
    const [gbpError, setGbpError] = useState<string | null>(null);

    // Meta account picker state (Facebook Pages / Instagram Accounts)
    const [showMetaPicker, setShowMetaPicker] = useState(false);
    const [metaType, setMetaType] = useState<string | null>(null);
    const [metaPendingKey, setMetaPendingKey] = useState<string | null>(null);
    const [metaAccounts, setMetaAccounts] = useState<MetaAccountOption[]>([]);
    const [metaLoadingAccounts, setMetaLoadingAccounts] = useState(false);
    const [metaConnecting, setMetaConnecting] = useState<string | null>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    /** Why: When true, the picker was opened by reusing a stored token (no Redis key) */
    const [metaFromStored, setMetaFromStored] = useState(false);

    // Fetch accounts on mount
    useEffect(() => {
        fetchAccounts();
    }, []);

    // Check for pending GBP location selection
    // Why: Like meta-pending, GBP may fail to open after bfcache restore from OAuth.
    const processGbpPending = useCallback(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const gbpPendingKey = params.get('gbp_pending');

        if (gbpPendingKey) {
            // Clear the URL param immediately
            const url = new URL(window.location.href);
            url.searchParams.delete('gbp_pending');
            window.history.replaceState({}, '', url.toString());

            // Why (BUG-01): Previously decoded base64-encoded tokens directly from the URL,
            // which leaked them in browser history, logs, and analytics. Now we fetch the
            // token data from the server using a short-lived Redis lookup key.
            setGbpLoadingLocations(true);
            setShowGbpLocationPicker(true);

            fetch(`/api/accounts/google-business?pendingKey=${encodeURIComponent(gbpPendingKey)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        showErrorToast(new Error(data.error), 'Failed to load business data');
                        setShowGbpLocationPicker(false);
                        return;
                    }
                    setGbpPendingData(data);
                    fetchGbpLocations(data.accessToken, data.accountId);
                })
                .catch(error => {
                    showErrorToast(error, 'Failed to load business data');
                    setShowGbpLocationPicker(false);
                    setGbpLoadingLocations(false);
                });
        }
    }, []);

    useEffect(() => {
        processGbpPending();

        const onVisibilityChange = () => {
            if (!document.hidden) {
                processGbpPending();
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [processGbpPending]);

    useEffect(() => {
        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                // Force reload after bfcache restore when gbp_pending is present
                if (typeof window !== 'undefined') {
                    const params = new URLSearchParams(window.location.search);
                    if (params.get('gbp_pending')) {
                        window.location.reload();
                    }
                }
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    useEffect(() => {
        processGbpPending();

        const onVisibilityChange = () => {
            if (!document.hidden) {
                processGbpPending();
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [processGbpPending]);

    useEffect(() => {
        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                // Force reload after bfcache restore when gbp_pending is present
                if (typeof window !== 'undefined') {
                    const params = new URLSearchParams(window.location.search);
                    if (params.get('gbp_pending')) {
                        window.location.reload();
                    }
                }
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    // Check for pending Meta account picker selection
    // Why: When returning from Meta OAuth, the browser back-forward cache (bfcache)
    // may restore the page without remounting React components. The `pageshow` event
    // fires on bfcache restore, letting us re-read the query params that the callback
    // appended. See: https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event
    const processMetaPending = useCallback(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const metaPending = params.get('meta_pending');
        const type = params.get('meta_type');

        if (metaPending && type) {
            // Clear URL params immediately
            const url = new URL(window.location.href);
            url.searchParams.delete('meta_pending');
            url.searchParams.delete('meta_type');
            window.history.replaceState({}, '', url.toString());

            setMetaType(type);
            setMetaPendingKey(metaPending);
            setMetaLoadingAccounts(true);
            setShowMetaPicker(true);

            fetch(`/api/accounts/meta-picker?pendingKey=${encodeURIComponent(metaPending)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        showErrorToast(new Error(data.error), 'Failed to load accounts');
                        setShowMetaPicker(false);
                        return;
                    }

                    // Why: Normalize the response to MetaAccountOption shape regardless of metaType
                    const options: MetaAccountOption[] = data.metaType === 'facebook'
                        ? data.accounts.map((p: { id: string; name: string; picture?: string; fanCount?: number }) => ({
                            id: p.id,
                            name: p.name,
                            picture: p.picture,
                            detail: p.fanCount ? `${Number(p.fanCount).toLocaleString()} followers` : undefined,
                        }))
                        : data.accounts.map((a: { igId: string; igName: string; igUsername: string; igPicture?: string; facebookPageName: string }) => ({
                            id: a.igId,
                            name: a.igName,
                            username: a.igUsername,
                            picture: a.igPicture,
                            detail: `Linked to ${a.facebookPageName}`,
                        }));

                    setMetaAccounts(options);
                })
                .catch(error => {
                    showErrorToast(error, 'Failed to load accounts');
                    setShowMetaPicker(false);
                })
                .finally(() => setMetaLoadingAccounts(false));
        }
    }, []);

    useEffect(() => {
        processMetaPending();

        const onVisibilityChange = () => {
            if (!document.hidden) {
                processMetaPending();
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [processMetaPending]);

    useEffect(() => {
        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                // Force reload after bfcache restore when meta_pending is present
                if (typeof window !== 'undefined') {
                    const params = new URLSearchParams(window.location.search);
                    if (params.get('meta_pending')) {
                        window.location.reload();
                    }
                }
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch('/api/accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch (error) {
            showErrorToast(error, 'Failed to load accounts');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchGbpLocations = useCallback(async (accessToken: string, accountId: string) => {
        try {
            const res = await fetch(`/api/accounts/google-business/locations?token=${encodeURIComponent(accessToken)}&accountId=${encodeURIComponent(accountId)}`);
            const data = await res.json();

            if (data.error) {
                setGbpError(data.error);
            } else {
                setGbpLocations(data.locations || []);
            }
        } catch (error) {
            showErrorToast(error, 'Failed to load locations');
            setGbpError('Failed to fetch locations');
        } finally {
            setGbpLoadingLocations(false);
        }
    }, []);

    const fetchOrganizations = useCallback(async () => {
        if (organizations.length > 0) return;
        setLoadingOrgs(true);
        try {
            const res = await fetch('/api/organizations');
            const data = await res.json();
            setOrganizations(data.organizations || []);
        } catch (error) {
            showErrorToast(error, 'Failed to load workspaces');
        } finally {
            setLoadingOrgs(false);
        }
    }, [organizations.length]);

    const handleAddAccount = useCallback(async (platform: string) => {
        // Bluesky uses AT Protocol session auth, not OAuth
        if (platform === 'bluesky') {
            setShowAddModal(false);
            setShowBlueskyModal(true);
            setBlueskyError(null);
            return;
        }

        // Manual platform uses custom dialog, not OAuth
        if (platform === 'manual') {
            setShowAddModal(false);
            setShowManualModal(true);
            return;
        }

        // Why: For Facebook/Instagram, check if we already have a valid Meta token.
        // If so, skip the OAuth redirect entirely and open the picker directly
        // using the stored token. This avoids an unnecessary round-trip to Meta.
        if (platform === 'facebook' || platform === 'instagram') {
            const hasStored = accounts.some(
                (a) =>
                    (a.platform === 'FACEBOOK' || a.platform === 'INSTAGRAM') &&
                    a.isActive &&
                    a.tokenExpiry &&
                    new Date(a.tokenExpiry) > new Date()
            );

            if (hasStored) {
                setShowAddModal(false);
                setMetaType(platform);
                setMetaFromStored(true);
                setMetaLoadingAccounts(true);
                setShowMetaPicker(true);

                try {
                    const res = await fetch(
                        `/api/accounts/meta-picker?fromStored=true&metaType=${platform}`
                    );
                    const data = await res.json();

                    if (!res.ok || data.error) {
                        // Why: Token may have been revoked server-side even though expiry looks OK.
                        // Fall through to normal OAuth flow.
                        setShowMetaPicker(false);
                        setMetaFromStored(false);
                    } else {
                        const options: MetaAccountOption[] = data.metaType === 'facebook'
                            ? data.accounts.map((p: { id: string; name: string; picture?: string; fanCount?: number }) => ({
                                id: p.id,
                                name: p.name,
                                picture: p.picture,
                                detail: p.fanCount ? `${Number(p.fanCount).toLocaleString()} followers` : undefined,
                            }))
                            : data.accounts.map((a: { igId: string; igName: string; igUsername: string; igPicture?: string; facebookPageName: string }) => ({
                                id: a.igId,
                                name: a.igName,
                                username: a.igUsername,
                                picture: a.igPicture,
                                detail: `Linked to ${a.facebookPageName}`,
                            }));

                        setMetaAccounts(options);
                        setMetaLoadingAccounts(false);
                        return; // Picker is open — done
                    }
                } catch {
                    // Stored-token path failed — fall through to OAuth
                    setShowMetaPicker(false);
                    setMetaFromStored(false);
                }
                setMetaLoadingAccounts(false);
            }
        }

        // Pinterest uses standard OAuth (directly approved API key)

        setConnecting(platform);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
            const data = await res.json();

            if (!res.ok) {
                showErrorToast(new Error(data.error || 'Failed to start connection'), `${platform} connection failed`);
                return;
            }

            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            showErrorToast(error, 'Failed to start account connection');
        } finally {
            setConnecting(null);
            setShowAddModal(false);
        }
    }, [accounts]);

    const handleBlueskyConnect = useCallback(async () => {
        if (!blueskyHandle.trim() || !blueskyAppPassword.trim()) {
            setBlueskyError('Handle and App Password are required');
            return;
        }

        setConnecting('bluesky');
        setBlueskyError(null);

        try {
            const res = await fetch('/api/accounts/bluesky', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: blueskyHandle.trim(),
                    password: blueskyAppPassword.trim(),
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setBlueskyError(data.error || 'Failed to connect');
                return;
            }

            await fetchAccounts();
            setShowBlueskyModal(false);
            setBlueskyHandle('');
            setBlueskyAppPassword('');
        } catch (error) {
            showErrorToast(error, 'Failed to connect Bluesky');
            setBlueskyError('Failed to connect to Bluesky');
        } finally {
            setConnecting(null);
        }
    }, [blueskyHandle, blueskyAppPassword, fetchAccounts]);

    /** Connect a manual/remind-to-post platform account */
    const handleManualConnect = useCallback(async (platformName: string, displayName: string) => {
        setConnecting('manual');
        try {
            const res = await fetch('/api/accounts/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platformName, displayName }),
            });
            const data = await res.json();

            if (!res.ok) {
                showErrorToast(new Error(data.error || 'Failed to connect'), 'Manual platform connection failed');
                return;
            }

            await fetchAccounts();
            setShowManualModal(false);
        } catch (error) {
            showErrorToast(error, 'Failed to add manual platform');
        } finally {
            setConnecting(null);
        }
    }, [fetchAccounts]);



    const handleSelectGbpLocation = useCallback(async (location: GbpLocation) => {
        if (!gbpPendingData) return;

        setGbpConnecting(location.locationId);
        setGbpError(null);

        try {
            const res = await fetch('/api/accounts/google-business/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: gbpPendingData.accessToken,
                    refreshToken: gbpPendingData.refreshToken,
                    expiresIn: gbpPendingData.expiresIn,
                    accountId: gbpPendingData.accountId,
                    accountName: gbpPendingData.accountName,
                    locationId: location.name,
                    locationTitle: location.title,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setShowGbpLocationPicker(false);
                setGbpPendingData(null);
                setGbpLocations([]);
                fetchAccounts();
            } else {
                setGbpError(data.error || 'Failed to connect location');
            }
        } catch (error) {
            showErrorToast(error, 'Failed to connect location');
            setGbpError('Failed to connect location');
        } finally {
            setGbpConnecting(null);
        }
    }, [gbpPendingData, fetchAccounts]);

    const handleDeleteAccount = useCallback(async (accountId: string) => {
        if (!confirm('Are you sure you want to disconnect this account?')) return;
        try {
            await fetch('/api/accounts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId }),
            });
            setAccounts((prev) => prev.filter((a) => a.id !== accountId));
        } catch (error) {
            showErrorToast(error, 'Failed to disconnect account');
        }
    }, []);

    const handleUpdateOrganization = useCallback(async (accountId: string) => {
        try {
            const res = await fetch('/api/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, organizationId: selectedOrgId }),
            });
            const data = await res.json();
            if (data.account) {
                setAccounts((prev) =>
                    prev.map((a) =>
                        a.id === accountId ? {
                            ...a,
                            organizationId: data.account.organizationId,
                            organization: data.account.organization,
                        } : a
                    )
                );
            }
            setEditingOrg(null);
            setSelectedOrgId(null);
        } catch (error) {
            showErrorToast(error, 'Failed to update workspace');
        }
    }, [selectedOrgId]);

    const handleReconnect = useCallback(async (accountId: string, platform: string) => {
        const normalizedPlatform = platform.toLowerCase();

        // Bluesky uses AT Protocol session auth — open credentials modal instead of OAuth
        if (normalizedPlatform === 'bluesky') {
            setShowBlueskyModal(true);
            setBlueskyError(null);
            return;
        }

        setReconnecting(accountId);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: normalizedPlatform, reconnect: true }),
            });
            const data = await res.json();

            if (!res.ok) {
                showErrorToast(new Error(data.error || 'Reconnect failed'), 'Failed to reconnect account');
                return;
            }

            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            showErrorToast(error, 'Failed to reconnect account');
        } finally {
            setReconnecting(null);
        }
    }, []);

    const closeGbpLocationPicker = useCallback(() => {
        setShowGbpLocationPicker(false);
        setGbpPendingData(null);
        setGbpLocations([]);
        setGbpError(null);
    }, []);

    /** Complete the Meta account connection with the user's selected page/account */
    const handleSelectMetaAccount = useCallback(async (account: MetaAccountOption) => {
        if (!metaFromStored && !metaPendingKey) return;

        setMetaConnecting(account.id);
        setMetaError(null);

        try {
            // Why: Two paths — fromStored sends metaType directly, pendingKey uses the Redis key.
            const body = metaFromStored
                ? {
                    fromStored: true,
                    metaType: metaType as 'facebook' | 'instagram',
                    ...(metaType === 'facebook'
                        ? { selectedPageId: account.id }
                        : { selectedIgId: account.id }),
                }
                : metaType === 'facebook'
                    ? { pendingKey: metaPendingKey, selectedPageId: account.id }
                    : { pendingKey: metaPendingKey, selectedIgId: account.id };

            const res = await fetch('/api/accounts/meta-picker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.success) {
                setShowMetaPicker(false);
                setMetaPendingKey(null);
                setMetaFromStored(false);
                setMetaAccounts([]);
                fetchAccounts();
            } else {
                setMetaError(data.error || 'Failed to connect account');
            }
        } catch (error) {
            showErrorToast(error, 'Failed to connect account');
            setMetaError('Failed to connect account');
        } finally {
            setMetaConnecting(null);
        }
    }, [metaPendingKey, metaFromStored, metaType, fetchAccounts]);

    const closeMetaPicker = useCallback(() => {
        setShowMetaPicker(false);
        setMetaPendingKey(null);
        setMetaFromStored(false);
        setMetaAccounts([]);
        setMetaError(null);
        setMetaType(null);
    }, []);

    return {
        // Data
        accounts,
        organizations,
        gbpLocations,
        gbpPendingData,

        // Loading states
        loading,
        connecting,
        reconnecting,
        loadingOrgs,
        gbpLoadingLocations,
        gbpConnecting,

        // Modal visibility
        showAddModal,
        setShowAddModal,
        showBlueskyModal,
        setShowBlueskyModal,
        showManualModal,
        setShowManualModal,
        showGbpLocationPicker,

        // Organization editing
        editingOrg,
        setEditingOrg,
        selectedOrgId,
        setSelectedOrgId,

        // Bluesky form
        blueskyHandle,
        setBlueskyHandle,
        blueskyAppPassword,
        setBlueskyAppPassword,
        blueskyError,

        // GBP state
        gbpError,

        // Meta picker
        showMetaPicker,
        metaType,
        metaAccounts,
        metaLoadingAccounts,
        metaConnecting,
        metaError,

        // Actions
        fetchAccounts,
        fetchOrganizations,
        handleAddAccount,
        handleBlueskyConnect,
        handleSelectGbpLocation,
        handleDeleteAccount,
        handleUpdateOrganization,
        handleReconnect,
        handleManualConnect,
        closeGbpLocationPicker,
        handleSelectMetaAccount,
        closeMetaPicker,
    };
}

/**
 * Check if token is expiring within 7 days
 */
export function isTokenExpiring(tokenExpiry: string | null): boolean {
    if (!tokenExpiry) return false;
    const expiry = new Date(tokenExpiry);
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return expiry < sevenDaysFromNow;
}

/**
 * Check if token has fully expired
 */
export function isTokenExpired(tokenExpiry: string | null): boolean {
    if (!tokenExpiry) return false;
    return new Date(tokenExpiry) < new Date();
}
