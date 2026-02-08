'use client';

/**
 * Connected Accounts Hook
 * Why: Centralizes state management and API calls for connected accounts.
 * Follows the 200-line standard decomposition pattern.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SocialAccount, Organization, GbpLocation, GbpPendingData } from './types';
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
    const [showPinterestModal, setShowPinterestModal] = useState(false);
    const [showGbpLocationPicker, setShowGbpLocationPicker] = useState(false);

    // Bluesky session auth state
    const [blueskyHandle, setBlueskyHandle] = useState('');
    const [blueskyAppPassword, setBlueskyAppPassword] = useState('');
    const [blueskyError, setBlueskyError] = useState<string | null>(null);

    // Late.dev integration state (used for Pinterest)
    const [lateConfigured, setLateConfigured] = useState<boolean | null>(null);
    const [checkingLateConfig, setCheckingLateConfig] = useState(false);

    // Pinterest via Late.dev state
    const [pinterestError, setPinterestError] = useState<string | null>(null);
    const [pinterestLateProfileId, setPinterestLateProfileId] = useState('');

    // Google Business location picker state
    const [gbpPendingData, setGbpPendingData] = useState<GbpPendingData | null>(null);
    const [gbpLocations, setGbpLocations] = useState<GbpLocation[]>([]);
    const [gbpLoadingLocations, setGbpLoadingLocations] = useState(false);
    const [gbpConnecting, setGbpConnecting] = useState<string | null>(null);
    const [gbpError, setGbpError] = useState<string | null>(null);

    // Fetch accounts on mount
    useEffect(() => {
        fetchAccounts();
    }, []);

    // Check for pending GBP location selection
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const gbpPending = params.get('gbp_pending');

        if (gbpPending) {
            try {
                const data = JSON.parse(atob(gbpPending));
                setGbpPendingData(data);
                setShowGbpLocationPicker(true);
                setGbpLoadingLocations(true);

                // Clear the URL param
                const url = new URL(window.location.href);
                url.searchParams.delete('gbp_pending');
                window.history.replaceState({}, '', url.toString());

                // Fetch locations
                fetchGbpLocations(data.accessToken, data.accountId);
            } catch (error) {
                showErrorToast(error, 'Failed to load business data');
            }
        }
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

        // Pinterest uses Late.dev OAuth for easier connection
        if (platform === 'pinterest') {
            setShowAddModal(false);
            setShowPinterestModal(true);
            setPinterestError(null);
            setCheckingLateConfig(true);

            try {
                const res = await fetch('/api/settings/integrations');
                const data = await res.json();
                setLateConfigured(data.isConfigured || false);
            } catch {
                setLateConfigured(false);
            } finally {
                setCheckingLateConfig(false);
            }
            return;
        }

        setConnecting(platform);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
            const data = await res.json();
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            showErrorToast(error, 'Failed to start account connection');
        } finally {
            setConnecting(null);
            setShowAddModal(false);
        }
    }, []);

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

    const handleLatePinterestConnect = useCallback(async () => {
        if (!pinterestLateProfileId.trim()) {
            setPinterestError('Late.dev Profile ID is required');
            return;
        }

        setConnecting('pinterest');
        setPinterestError(null);

        try {
            const res = await fetch('/api/accounts/late/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: 'pinterest',
                    profileId: pinterestLateProfileId.trim(),
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setPinterestError(data.error || 'Failed to initiate connection');
                return;
            }

            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            showErrorToast(error, 'Failed to connect Pinterest');
            setPinterestError('Failed to connect via Late.dev');
        } finally {
            setConnecting(null);
        }
    }, [pinterestLateProfileId]);

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
        setReconnecting(accountId);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platform.toLowerCase(), reconnect: true }),
            });
            const data = await res.json();
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
        checkingLateConfig,
        gbpLoadingLocations,
        gbpConnecting,
        lateConfigured,

        // Modal visibility
        showAddModal,
        setShowAddModal,
        showBlueskyModal,
        setShowBlueskyModal,
        showPinterestModal,
        setShowPinterestModal,
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

        // Pinterest form
        pinterestLateProfileId,
        setPinterestLateProfileId,
        pinterestError,

        // GBP state
        gbpError,

        // Actions
        fetchAccounts,
        fetchOrganizations,
        handleAddAccount,
        handleBlueskyConnect,
        handleLatePinterestConnect,
        handleSelectGbpLocation,
        handleDeleteAccount,
        handleUpdateOrganization,
        handleReconnect,
        closeGbpLocationPicker,
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
