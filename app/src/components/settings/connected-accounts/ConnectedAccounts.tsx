'use client';

/**
 * Connected Accounts Component
 * Why: Thin orchestrator that composes extracted sub-components.
 * Refactored from 1,070 lines to ~90 lines following the 200-line standard.
 */

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useConnectedAccounts } from './use-connected-accounts';
import { AccountCard } from './AccountCard';
import { AddPlatformDialog } from './AddPlatformDialog';
import { BlueskyConnectDialog } from './BlueskyConnectDialog';
import { PinterestConnectDialog } from './PinterestConnectDialog';
import { GbpLocationPickerDialog } from './GbpLocationPickerDialog';

export function ConnectedAccounts() {
    const {
        // Data
        accounts,
        organizations,
        gbpLocations,

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
        fetchOrganizations,
        handleAddAccount,
        handleBlueskyConnect,
        handleLatePinterestConnect,
        handleSelectGbpLocation,
        handleDeleteAccount,
        handleUpdateOrganization,
        handleReconnect,
        closeGbpLocationPicker,
    } = useConnectedAccounts();

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Connected Accounts</h2>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4" />
                    Add Account
                </Button>
            </div>

            {/* Account List */}
            {loading ? (
                <div className="text-center py-8 text-[var(--text-muted)]">Loading accounts...</div>
            ) : accounts.length === 0 ? (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)] mb-4">No accounts connected yet</p>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="h-4 w-4" />
                        Connect your first account
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {accounts.map((account) => (
                        <AccountCard
                            key={account.id}
                            account={account}
                            organizations={organizations}
                            loadingOrgs={loadingOrgs}
                            editingOrg={editingOrg}
                            selectedOrgId={selectedOrgId}
                            reconnecting={reconnecting}
                            onEditOrg={setEditingOrg}
                            onCancelEditOrg={() => { setEditingOrg(null); setSelectedOrgId(null); }}
                            onSaveOrg={handleUpdateOrganization}
                            onSelectOrgId={setSelectedOrgId}
                            onReconnect={handleReconnect}
                            onDelete={handleDeleteAccount}
                            onFetchOrganizations={fetchOrganizations}
                        />
                    ))}
                </div>
            )}

            {/* Dialogs */}
            <AddPlatformDialog
                open={showAddModal}
                onOpenChange={setShowAddModal}
                connecting={connecting}
                onSelectPlatform={handleAddAccount}
            />

            <BlueskyConnectDialog
                open={showBlueskyModal}
                onOpenChange={setShowBlueskyModal}
                handle={blueskyHandle}
                onHandleChange={setBlueskyHandle}
                appPassword={blueskyAppPassword}
                onAppPasswordChange={setBlueskyAppPassword}
                error={blueskyError}
                connecting={connecting === 'bluesky'}
                onConnect={handleBlueskyConnect}
            />

            <PinterestConnectDialog
                open={showPinterestModal}
                onOpenChange={setShowPinterestModal}
                checkingConfig={checkingLateConfig}
                lateConfigured={lateConfigured}
                profileId={pinterestLateProfileId}
                onProfileIdChange={setPinterestLateProfileId}
                error={pinterestError}
                connecting={connecting === 'pinterest'}
                onConnect={handleLatePinterestConnect}
            />

            <GbpLocationPickerDialog
                open={showGbpLocationPicker}
                onClose={closeGbpLocationPicker}
                loading={gbpLoadingLocations}
                locations={gbpLocations}
                connecting={gbpConnecting}
                error={gbpError}
                onSelectLocation={handleSelectGbpLocation}
            />
        </div>
    );
}
