'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Instagram, Youtube, Check, AlertCircle, Loader2,
    Eye, EyeOff, ExternalLink, ChevronDown, Facebook, Globe
} from 'lucide-react';

// Custom icons for platforms where Lucide might not have exact match or we want consistent style
// For now using Lucide icons or text where appropriate as per original design

const PLATFORM_CONFIG = [
    {
        id: 'META',
        name: 'Meta (Facebook & Instagram)',
        icon: Facebook,
        color: '#1877F2',
        devPortalUrl: 'https://developers.facebook.com/apps',
        devPortalLabel: 'Meta Developers',
    },
    {
        id: 'PINTEREST',
        name: 'Pinterest API',
        icon: Globe, // Using Globe as generic web icon for Pinterest if specific one missing, or text
        color: '#E60023',
        devPortalUrl: 'https://developers.pinterest.com/apps',
        devPortalLabel: 'Pinterest Developers',
    },
    {
        id: 'TIKTOK',
        name: 'TikTok for Business',
        icon: Globe, // TikTok icon substitute
        color: '#000000',
        devPortalUrl: 'https://developers.tiktok.com',
        devPortalLabel: 'TikTok Developers',
    },
    {
        id: 'YOUTUBE',
        name: 'YouTube Data API',
        icon: Youtube,
        color: '#FF0000',
        devPortalUrl: 'https://console.cloud.google.com/apis/dashboard',
        devPortalLabel: 'Google Cloud Console',
    },
];

interface PlatformCredentialData {
    id: string | null;
    platform: string;
    clientId: string;
    clientSecretMasked: string;
    isConfigured: boolean;
    updatedAt: string | null;
}

export function PlatformCredentialsSettings() {
    const [credentials, setCredentials] = useState<PlatformCredentialData[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [formData, setFormData] = useState<Record<string, { clientId: string; clientSecret: string }>>({});
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

    useEffect(() => {
        fetchCredentials();
    }, []);

    async function fetchCredentials() {
        try {
            const res = await fetch('/api/settings/platform-credentials');
            const data = await res.json();
            if (data.credentials) {
                setCredentials(data.credentials);
                // Initialize form data with existing values
                const initial: Record<string, { clientId: string; clientSecret: string }> = {};
                data.credentials.forEach((cred: PlatformCredentialData) => {
                    initial[cred.platform] = {
                        clientId: cred.clientId || '',
                        clientSecret: '', // Don't pre-fill secret for security
                    };
                });
                setFormData(initial);
            }
        } catch (error) {
            console.error('Failed to fetch credentials:', error);
            setMessage({ type: 'error', text: 'Failed to load credentials' });
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(platform: string) {
        const data = formData[platform];
        if (!data?.clientId?.trim()) {
            setMessage({ type: 'error', text: 'Client ID is required' });
            return;
        }

        // Check if this is a new credential (requires secret)
        const existing = credentials.find((c) => c.platform === platform);
        if (!existing?.isConfigured && !data.clientSecret?.trim()) {
            setMessage({ type: 'error', text: 'Client Secret is required for new credentials' });
            return;
        }

        setSaving(platform);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/platform-credentials', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform,
                    clientId: data.clientId.trim(),
                    clientSecret: data.clientSecret?.trim() || undefined,
                }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                setMessage({ type: 'success', text: `${platform} credentials saved successfully` });
                // Clear secret field and refresh
                setFormData((prev) => ({
                    ...prev,
                    [platform]: { ...prev[platform], clientSecret: '' },
                }));
                await fetchCredentials();
            } else {
                setMessage({ type: 'error', text: result.error || 'Failed to save' });
            }
        } catch (error) {
            console.error('Failed to save credentials:', error);
            setMessage({ type: 'error', text: 'Failed to save credentials' });
        } finally {
            setSaving(null);
        }
    }

    function updateFormField(platform: string, field: 'clientId' | 'clientSecret', value: string) {
        setFormData((prev) => ({
            ...prev,
            [platform]: {
                ...prev[platform],
                [field]: value,
            },
        }));
    }

    function toggleSecretVisibility(platform: string) {
        setShowSecrets((prev) => ({ ...prev, [platform]: !prev[platform] }));
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-xl font-semibold">Platform Integrations</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Configure OAuth credentials to connect social media accounts
                </p>
            </div>

            {message && (
                <div
                    className={`mb-4 rounded-lg p-3 text-sm ${message.type === 'success'
                        ? 'bg-[var(--success-light)] text-[var(--success)]'
                        : 'bg-[var(--error-light)] text-[var(--error)]'
                        }`}
                >
                    {message.text}
                </div>
            )}

            {/* Card Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PLATFORM_CONFIG.map((platform) => {
                    const Icon = platform.icon;
                    const cred = credentials.find((c) => c.platform === platform.id);
                    const form = formData[platform.id] || { clientId: '', clientSecret: '' };
                    const isConfigured = cred?.isConfigured || false;
                    const isSaving = saving === platform.id;
                    const isExpanded = expandedPlatform === platform.id;

                    return (
                        <div
                            key={platform.id}
                            className={`card transition-all duration-200 ${isExpanded ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}
                        >
                            {/* Compact Card Header - Always Visible */}
                            <button
                                type="button"
                                onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}
                                className="w-full p-4 flex items-center gap-3 text-left hover:bg-[var(--bg-tertiary)]/50 rounded-lg transition-colors"
                            >
                                {/* Platform icon */}
                                <div
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                                    style={{ backgroundColor: `${platform.color}20` }}
                                >
                                    <Icon className="h-5 w-5" style={{ color: platform.color }} />
                                </div>

                                {/* Platform name and status */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-sm">{platform.name}</h3>
                                    {isConfigured ? (
                                        <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                                            <Check className="h-3 w-3" />
                                            Configured
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-xs text-[var(--warning)]">
                                            <AlertCircle className="h-3 w-3" />
                                            Not configured
                                        </span>
                                    )}
                                </div>

                                {/* Expand indicator */}
                                <ChevronDown
                                    className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {/* Expandable Credential Form */}
                            {isExpanded && (
                                <div className="px-4 pb-4 border-t border-[var(--border)] mt-2 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Client ID */}
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                                                Client ID
                                            </label>
                                            <Input
                                                type="text"
                                                value={form.clientId}
                                                onChange={(e) => updateFormField(platform.id, 'clientId', e.target.value)}
                                                placeholder="Enter Client ID"
                                            />
                                        </div>

                                        {/* Client Secret */}
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                                                Client Secret
                                                {isConfigured && (
                                                    <span className="ml-1 text-[var(--text-muted)]">
                                                        ({cred?.clientSecretMasked})
                                                    </span>
                                                )}
                                            </label>
                                            <div className="relative">
                                                <Input
                                                    type={showSecrets[platform.id] ? 'text' : 'password'}
                                                    value={form.clientSecret}
                                                    onChange={(e) => updateFormField(platform.id, 'clientSecret', e.target.value)}
                                                    placeholder={isConfigured ? 'Leave blank to keep current' : 'Enter Client Secret'}
                                                    className="pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleSecretVisibility(platform.id);
                                                    }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                                >
                                                    {showSecrets[platform.id] ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions Row */}
                                    <div className="mt-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Button
                                                onClick={() => handleSave(platform.id)}
                                                disabled={isSaving}
                                                className="text-sm"
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    'Save Credentials'
                                                )}
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                onClick={() => setExpandedPlatform(null)}
                                                className="text-sm"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                        <a
                                            href={platform.devPortalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-sm text-[var(--accent-gold)] hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            {platform.devPortalLabel}
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Help text */}
            <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-4">
                <h4 className="font-medium mb-2">How to get credentials</h4>
                <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
                    <li>Visit the developer portal for each platform</li>
                    <li>Create a new OAuth application</li>
                    <li>
                        Set the redirect URI to:{' '}
                        <code className="bg-[var(--bg-secondary)] px-1 rounded break-all">
                            {typeof window !== 'undefined' ? `${window.location.origin}/api/accounts/callback/[platform]` : '/api/accounts/callback/[platform]'}
                        </code>
                    </li>
                    <li>Copy the Client ID and Client Secret here</li>
                </ol>
            </div>
        </div>
    );
}
