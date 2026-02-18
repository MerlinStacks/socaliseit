'use client';

/**
 * Platform Credentials Admin Page
 * Configure OAuth app credentials for all social media platforms
 */

import { useState, useEffect } from 'react';
import { clientLogger } from '@/lib/client-logger';
import {
    Key,
    Save,
    Trash2,
    ExternalLink,
    Eye,
    EyeOff,
    AlertCircle,
    CheckCircle,
    Zap,
    Loader2,
} from 'lucide-react';

interface PlatformCredential {
    id: string | null;
    platform: string;
    clientId: string;
    clientSecretMasked: string;
    webhookVerifyToken: string | null;
    isConfigured: boolean;
    updatedAt: string | null;
}

const PLATFORM_INFO: Record<string, { name: string; docsUrl: string; color: string }> = {
    META: { name: 'Meta (Facebook & Instagram)', docsUrl: 'https://developers.facebook.com/', color: 'bg-blue-500' },
    TIKTOK: { name: 'TikTok', docsUrl: 'https://developers.tiktok.com/', color: 'bg-gray-800' },
    YOUTUBE: { name: 'YouTube', docsUrl: 'https://console.cloud.google.com/', color: 'bg-red-500' },
    PINTEREST: { name: 'Pinterest', docsUrl: 'https://developers.pinterest.com/', color: 'bg-red-600' },
    LINKEDIN: { name: 'LinkedIn', docsUrl: 'https://developer.linkedin.com/', color: 'bg-blue-600' },
    GOOGLE_BUSINESS: { name: 'Google Business Profile', docsUrl: 'https://console.cloud.google.com/', color: 'bg-blue-400' },
    BLUESKY: { name: 'Bluesky', docsUrl: 'https://bsky.app/', color: 'bg-sky-500' },
    THREADS: { name: 'Threads', docsUrl: 'https://developers.facebook.com/', color: 'bg-gray-800' },
};

export default function PlatformCredentialsPage() {
    const [credentials, setCredentials] = useState<PlatformCredential[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [testing, setTesting] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

    // Form state for editing
    const [formData, setFormData] = useState<Record<string, { clientId: string; clientSecret: string }>>({});

    useEffect(() => {
        fetchCredentials();
    }, []);

    const fetchCredentials = async () => {
        try {
            const res = await fetch('/api/admin/platform-credentials');
            const data = await res.json();
            setCredentials(data.credentials);

            // Initialize form data
            const forms: Record<string, { clientId: string; clientSecret: string }> = {};
            for (const cred of data.credentials) {
                forms[cred.platform] = {
                    clientId: cred.clientId || '',
                    clientSecret: '', // Don't pre-fill secrets
                };
            }
            setFormData(forms);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch credentials');
        } finally {
            setLoading(false);
        }
    };

    const saveCredential = async (platform: string) => {
        const form = formData[platform];
        if (!form?.clientId) {
            setMessage({ type: 'error', text: 'Client ID is required' });
            return;
        }

        setSaving(platform);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/platform-credentials', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform,
                    clientId: form.clientId,
                    clientSecret: form.clientSecret || undefined,
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: `${PLATFORM_INFO[platform]?.name || platform} credentials saved` });
                await fetchCredentials();
                // Clear secret field after save
                setFormData(prev => ({
                    ...prev,
                    [platform]: { ...prev[platform], clientSecret: '' }
                }));
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.error || 'Failed to save credentials' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save credentials' });
        } finally {
            setSaving(null);
        }
    };

    const deleteCredential = async (platform: string) => {
        if (!confirm(`Are you sure you want to delete ${PLATFORM_INFO[platform]?.name || platform} credentials?`)) {
            return;
        }

        setSaving(platform);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/platform-credentials', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Credentials deleted' });
                await fetchCredentials();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.error || 'Failed to delete credentials' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to delete credentials' });
        } finally {
            setSaving(null);
        }
    };

    /**
     * Tests platform OAuth credentials by calling the test API endpoint.
     * Why: Validates credentials work before users attempt to connect accounts.
     */
    const testConnection = async (platform: string) => {
        setTesting(platform);
        setMessage(null);

        try {
            const res = await fetch(`/api/settings/platform-credentials/test?platform=${platform}`);
            const data = await res.json();

            if (res.ok && data.success) {
                setMessage({ type: 'success', text: `${PLATFORM_INFO[platform]?.name || platform} credentials are valid!` });
            } else {
                setMessage({ type: 'error', text: data.error || 'Credential test failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to test credentials' });
        } finally {
            setTesting(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-gray-400">Loading credentials...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Platform Credentials</h1>
                <p className="text-gray-400 mt-1">
                    Configure OAuth app credentials for social media platforms. These are shared across all organizations.
                </p>
            </div>

            {message && (
                <div className={`mb-6 rounded-lg p-4 flex items-center gap-3 ${message.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                    {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    {message.text}
                </div>
            )}

            <div className="space-y-4">
                {credentials.map((cred) => {
                    const info = PLATFORM_INFO[cred.platform] || { name: cred.platform, docsUrl: '#', color: 'bg-gray-500' };
                    const isExpanded = expandedPlatform === cred.platform;
                    const form = formData[cred.platform] || { clientId: '', clientSecret: '' };

                    return (
                        <div
                            key={cred.platform}
                            className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
                        >
                            {/* Header */}
                            <button
                                onClick={() => setExpandedPlatform(isExpanded ? null : cred.platform)}
                                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`h-10 w-10 rounded-lg ${info.color} flex items-center justify-center`}>
                                        <Key className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-white">{info.name}</p>
                                        <p className={`text-sm ${cred.isConfigured ? 'text-green-400' : 'text-gray-500'}`}>
                                            {cred.isConfigured ? 'Configured' : 'Not configured'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <a
                                        href={info.docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-gray-400 hover:text-white p-2"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                    <span
                                        className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    >
                                        ▼
                                    </span>
                                </div>
                            </button>

                            {/* Expanded Form */}
                            {isExpanded && (
                                <div className="border-t border-gray-800 p-6 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                                Client ID / App ID
                                            </label>
                                            <input
                                                type="text"
                                                value={form.clientId}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    [cred.platform]: { ...prev[cred.platform], clientId: e.target.value }
                                                }))}
                                                placeholder="Enter Client ID"
                                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                                Client Secret / App Secret
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showSecrets[cred.platform] ? 'text' : 'password'}
                                                    value={form.clientSecret}
                                                    onChange={(e) => setFormData(prev => ({
                                                        ...prev,
                                                        [cred.platform]: { ...prev[cred.platform], clientSecret: e.target.value }
                                                    }))}
                                                    placeholder={cred.isConfigured ? cred.clientSecretMasked : 'Enter Client Secret'}
                                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowSecrets(prev => ({ ...prev, [cred.platform]: !prev[cred.platform] }))}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                                >
                                                    {showSecrets[cred.platform] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                            {cred.isConfigured && (
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Leave blank to keep existing secret
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Webhook Token (for Meta) */}
                                    {cred.webhookVerifyToken && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                                Webhook Verify Token (auto-generated)
                                            </label>
                                            <code className="block rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-gray-300 text-sm font-mono">
                                                {cred.webhookVerifyToken}
                                            </code>
                                            <p className="mt-1 text-xs text-gray-500">
                                                Use this token in your Meta Developer App webhook configuration
                                            </p>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                                        <div className="flex items-center gap-3">
                                            {cred.isConfigured && (
                                                <button
                                                    onClick={() => deleteCredential(cred.platform)}
                                                    disabled={saving === cred.platform || testing === cred.platform}
                                                    className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {cred.isConfigured && (
                                                <button
                                                    onClick={() => testConnection(cred.platform)}
                                                    disabled={testing === cred.platform || saving === cred.platform}
                                                    className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                                                >
                                                    {testing === cred.platform ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Testing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Zap className="h-4 w-4" />
                                                            Test Connection
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => saveCredential(cred.platform)}
                                                disabled={saving === cred.platform || testing === cred.platform || !form.clientId}
                                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                            >
                                                <Save className="h-4 w-4" />
                                                {saving === cred.platform ? 'Saving...' : 'Save Credentials'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
