'use client';

/**
 * Platform Settings Page
 * Configure global platform settings
 */

import { useState, useEffect, useCallback } from 'react';
import { Settings, Save, AlertTriangle, Shield, Users, Zap, TrendingUp, Eye, EyeOff, BellRing, Loader2, RefreshCw, Trash2, CheckCircle } from 'lucide-react';
import { clientLogger } from '@/lib/client-logger';

interface PlatformSettings {
    id: string;
    registrationEnabled: boolean;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
    maxOrganizationsPerUser: number;
    maxMembersPerOrganization: number;
    rateLimitRequestsPerMinute: number;
    tiktokDiscoveryTokenMasked: string | null;
    updatedAt: string;
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<PlatformSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [tiktokToken, setTiktokToken] = useState('');
    const [showToken, setShowToken] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings');
            const data = await res.json();
            setSettings(data.settings);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch settings');
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        if (!settings) return;
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    registrationEnabled: settings.registrationEnabled,
                    maintenanceMode: settings.maintenanceMode,
                    maintenanceMessage: settings.maintenanceMessage,
                    maxOrganizationsPerUser: settings.maxOrganizationsPerUser,
                    maxMembersPerOrganization: settings.maxMembersPerOrganization,
                    rateLimitRequestsPerMinute: settings.rateLimitRequestsPerMinute,
                    ...(tiktokToken ? { tiktokDiscoveryToken: tiktokToken } : {}),
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings);
                setTiktokToken(''); // Clear input after save
                setMessage({ type: 'success', text: 'Settings saved successfully' });
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to save settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-gray-400">Loading settings...</p>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-red-400">Failed to load settings</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
                    <p className="text-gray-400 mt-1">
                        Configure global platform behavior
                    </p>
                </div>
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            {message && (
                <div className={`mb-6 rounded-lg p-4 ${message.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="space-y-6">
                {/* Access Control */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Shield className="h-5 w-5 text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">Access Control</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-white">User Registration</p>
                                <p className="text-sm text-gray-400">Allow new users to sign up</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.registrationEnabled}
                                    onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-white">Maintenance Mode</p>
                                <p className="text-sm text-gray-400">Disable access for non-admins</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.maintenanceMode}
                                    onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                            </label>
                        </div>

                        {settings.maintenanceMode && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Maintenance Message
                                </label>
                                <textarea
                                    value={settings.maintenanceMessage || ''}
                                    onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                                    placeholder="We're performing scheduled maintenance..."
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                                    rows={2}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Limits */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Users className="h-5 w-5 text-purple-400" />
                        <h2 className="text-lg font-semibold text-white">Resource Limits</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Max Organizations per User
                            </label>
                            <input
                                type="number"
                                value={settings.maxOrganizationsPerUser}
                                onChange={(e) => setSettings({ ...settings, maxOrganizationsPerUser: parseInt(e.target.value, 10) || 1 })}
                                min={1}
                                max={100}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Max Members per Organization
                            </label>
                            <input
                                type="number"
                                value={settings.maxMembersPerOrganization}
                                onChange={(e) => setSettings({ ...settings, maxMembersPerOrganization: parseInt(e.target.value, 10) || 1 })}
                                min={1}
                                max={1000}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Rate Limiting */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Zap className="h-5 w-5 text-amber-400" />
                        <h2 className="text-lg font-semibold text-white">Rate Limiting</h2>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            API Requests per Minute (per user)
                        </label>
                        <input
                            type="number"
                            value={settings.rateLimitRequestsPerMinute}
                            onChange={(e) => setSettings({ ...settings, rateLimitRequestsPerMinute: parseInt(e.target.value, 10) || 10 })}
                            min={10}
                            max={10000}
                            className="w-full max-w-xs rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* API Keys */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <TrendingUp className="h-5 w-5 text-cyan-400" />
                        <h2 className="text-lg font-semibold text-white">TikTok Discovery API</h2>
                    </div>

                    <p className="text-sm text-gray-400 mb-4">
                        Enables real trending hashtags and sounds from TikTok. Get a token from{' '}
                        <a href="https://ads.tiktok.com/marketing_api/apps" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                            ads.tiktok.com
                        </a>
                        {' '}→ Create App → Discovery scope.
                    </p>

                    {settings.tiktokDiscoveryTokenMasked && (
                        <div className="mb-3 flex items-center gap-2">
                            <span className="text-xs text-gray-500">Current:</span>
                            <code className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                                {settings.tiktokDiscoveryTokenMasked}
                            </code>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <div className="relative flex-1 max-w-md">
                            <input
                                type={showToken ? 'text' : 'password'}
                                value={tiktokToken}
                                onChange={(e) => setTiktokToken(e.target.value)}
                                placeholder={settings.tiktokDiscoveryTokenMasked ? 'Enter new token to update...' : 'Paste access token...'}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {settings.tiktokDiscoveryTokenMasked && (
                            <button
                                type="button"
                                onClick={async () => {
                                    const res = await fetch('/api/admin/settings', {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ tiktokDiscoveryToken: null }),
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        setSettings(data.settings);
                                        setMessage({ type: 'success', text: 'TikTok Discovery token removed' });
                                    }
                                }}
                                className="rounded-lg border border-red-800 px-3 py-2.5 text-xs text-red-400 hover:bg-red-950 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* VAPID Key Management */}
                <VapidKeyCard />

                {/* Warning */}
                <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                        <div>
                            <p className="font-medium text-red-400">Caution</p>
                            <p className="text-sm text-red-200/70 mt-1">
                                Changes to these settings affect all users immediately. Test changes
                                in a staging environment before applying to production.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * VAPID Key Management Card
 * Why: Super admins need a UI to generate and manage the system-wide VAPID keys
 * for Web Push notifications instead of using curl against the API.
 */
function VapidKeyCard() {
    const [vapidState, setVapidState] = useState<{
        publicKey: string | null;
        isConfigured: boolean;
        createdAt: string | null;
    }>({ publicKey: null, isConfigured: false, createdAt: null });
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'regenerate' | 'delete' | null>(null);
    const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchVapid = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/vapid');
            const data = await res.json();
            setVapidState({
                publicKey: data.publicKey,
                isConfigured: data.isConfigured,
                createdAt: data.createdAt,
            });
        } catch {
            clientLogger.error('Failed to fetch VAPID status');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchVapid(); }, [fetchVapid]);

    const generateKeys = async () => {
        setActing(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/vapid', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setVapidState({ publicKey: data.publicKey, isConfigured: true, createdAt: data.createdAt });
                setResult({
                    type: 'success',
                    text: `VAPID keys ${vapidState.isConfigured ? 'regenerated' : 'generated'}. ${data.subscriptionsCleared || 0} subscription(s) cleared.`,
                });
            } else {
                setResult({ type: 'error', text: data.error || 'Failed to generate keys' });
            }
        } catch {
            setResult({ type: 'error', text: 'Network error' });
        } finally {
            setActing(false);
            setConfirmAction(null);
        }
    };

    const deleteKeys = async () => {
        setActing(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/vapid', { method: 'DELETE' });
            if (res.ok) {
                setVapidState({ publicKey: null, isConfigured: false, createdAt: null });
                setResult({ type: 'success', text: 'VAPID keys and all subscriptions deleted.' });
            } else {
                const data = await res.json();
                setResult({ type: 'error', text: data.error || 'Failed to delete keys' });
            }
        } catch {
            setResult({ type: 'error', text: 'Network error' });
        } finally {
            setActing(false);
            setConfirmAction(null);
        }
    };

    if (loading) {
        return (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <div className="flex items-center gap-3">
                    <BellRing className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-lg font-semibold text-white">Push Notifications (VAPID)</h2>
                </div>
                <p className="text-gray-400 text-sm mt-4">Loading...</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center gap-3 mb-4">
                <BellRing className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Push Notifications (VAPID)</h2>
                {vapidState.isConfigured ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                        <CheckCircle className="h-3 w-3" /> Configured
                    </span>
                ) : (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                        Not Configured
                    </span>
                )}
            </div>

            <p className="text-sm text-gray-400 mb-4">
                VAPID keys are required for Web Push notifications. One key pair serves the entire platform.
                {vapidState.isConfigured && ' Regenerating will invalidate all existing subscriptions.'}
            </p>

            {result && (
                <div className={`mb-4 rounded-lg p-3 text-sm ${result.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                    {result.text}
                </div>
            )}

            {vapidState.isConfigured && (
                <div className="mb-4 space-y-2">
                    <div>
                        <span className="text-xs text-gray-500">Public Key:</span>
                        <code className="ml-2 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded break-all">
                            {vapidState.publicKey?.slice(0, 20)}...{vapidState.publicKey?.slice(-10)}
                        </code>
                    </div>
                    {vapidState.createdAt && (
                        <div>
                            <span className="text-xs text-gray-500">Generated:</span>
                            <span className="ml-2 text-xs text-gray-400">
                                {new Date(vapidState.createdAt).toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Confirmation dialogs */}
            {confirmAction && (
                <div className="mb-4 rounded-lg border border-amber-900/30 bg-amber-950/20 p-4">
                    <p className="text-sm text-amber-300 mb-3">
                        {confirmAction === 'regenerate'
                            ? '⚠️ This will invalidate ALL existing push subscriptions. Users must re-subscribe.'
                            : '⚠️ This will delete VAPID keys and all push subscriptions. Push notifications will stop working.'}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={confirmAction === 'regenerate' ? generateKeys : deleteKeys}
                            disabled={acting}
                            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                        >
                            {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            {acting ? 'Processing...' : 'Confirm'}
                        </button>
                        <button
                            onClick={() => setConfirmAction(null)}
                            disabled={acting}
                            className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
                {!vapidState.isConfigured ? (
                    <button
                        onClick={generateKeys}
                        disabled={acting}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                        {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                        Generate VAPID Keys
                    </button>
                ) : (
                    <>
                        <button
                            onClick={() => setConfirmAction('regenerate')}
                            disabled={acting || confirmAction !== null}
                            className="flex items-center gap-2 rounded-lg border border-amber-800 px-3 py-2 text-sm text-amber-400 hover:bg-amber-950 disabled:opacity-50 transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Regenerate
                        </button>
                        <button
                            onClick={() => setConfirmAction('delete')}
                            disabled={acting || confirmAction !== null}
                            className="flex items-center gap-2 rounded-lg border border-red-800 px-3 py-2 text-sm text-red-400 hover:bg-red-950 disabled:opacity-50 transition-colors"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
