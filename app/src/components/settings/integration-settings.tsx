'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Plug2, Key, Check, AlertCircle, Loader2, Eye, EyeOff, ExternalLink, TestTube2
} from 'lucide-react';

interface IntegrationData {
    lateApiKey: string | null;
    lateProfileId: string | null;
    isConfigured: boolean;
}

/**
 * Integration Settings Component
 * 
 * Manages third-party API integrations like Late.dev for Google Business and Pinterest posting.
 */
export function IntegrationSettings() {
    const [config, setConfig] = useState<IntegrationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    async function fetchConfig() {
        try {
            const res = await fetch('/api/settings/integrations');
            const data = await res.json();
            setConfig(data);
        } catch (error) {
            console.error('Failed to fetch integration settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings' });
        } finally {
            setLoading(false);
        }
    }

    async function handleTestApiKey() {
        const keyToTest = apiKey.trim() || null;

        if (!keyToTest && !config?.isConfigured) {
            setMessage({ type: 'error', text: 'Enter an API key to test' });
            return;
        }

        setTesting(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyToTest }),
            });

            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: data.message || 'Connection successful!' });
            } else {
                setMessage({ type: 'error', text: data.error || 'Connection failed' });
            }
        } catch (error) {
            console.error('Failed to test API key:', error);
            setMessage({ type: 'error', text: 'Failed to connect to Late.dev' });
        } finally {
            setTesting(false);
        }
    }

    async function handleSaveApiKey() {
        if (!apiKey.trim()) {
            setMessage({ type: 'error', text: 'Enter an API key to save' });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/integrations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lateApiKey: apiKey.trim() }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setMessage({ type: 'success', text: 'API key saved successfully' });
                setApiKey('');
                await fetchConfig();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to save' });
            }
        } catch (error) {
            console.error('Failed to save API key:', error);
            setMessage({ type: 'error', text: 'Failed to save API key' });
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
        );
    }

    return (
        <div className="mb-8">
            <div className="mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Plug2 className="h-5 w-5 text-[var(--accent-gold)]" />
                    Third-Party Integrations
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Connect external services to extend platform capabilities
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

            {/* Late.dev API Card */}
            <div className="card p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 text-white font-bold text-lg">
                        L
                    </div>
                    <div className="flex-1">
                        <h4 className="font-medium">Late.dev API</h4>
                        <p className="text-xs text-[var(--text-muted)]">
                            Unified social media API for Google Business Profile and Pinterest
                        </p>
                    </div>
                    {config?.isConfigured ? (
                        <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-[var(--success-light)] text-[var(--success)]">
                            <Check className="h-3 w-3" />
                            Connected
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-[var(--warning-light)] text-[var(--warning)]">
                            <AlertCircle className="h-3 w-3" />
                            Not configured
                        </span>
                    )}
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                            <Key className="h-3.5 w-3.5" />
                            API Key
                        </label>
                        <div className="relative">
                            <Input
                                type={showApiKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={config?.isConfigured ? 'Enter new key to update' : 'Enter your Late.dev API key'}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {config?.isConfigured && config.lateApiKey && (
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                Current: {config.lateApiKey}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex gap-2">
                            <Button
                                onClick={handleTestApiKey}
                                disabled={testing || (!apiKey.trim() && !config?.isConfigured)}
                                variant="secondary"
                                className="text-sm"
                            >
                                {testing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <TestTube2 className="h-4 w-4 mr-1" />
                                        Test Connection
                                    </>
                                )}
                            </Button>
                            <Button
                                onClick={handleSaveApiKey}
                                disabled={saving || !apiKey.trim()}
                                className="text-sm"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save API Key'
                                )}
                            </Button>
                        </div>
                        <a
                            href="https://getlate.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-[var(--accent-gold)] hover:underline"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Get API Key
                        </a>
                    </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">
                        <strong className="text-[var(--text-primary)]">Why Late.dev?</strong>{' '}
                        Google Business Profile and Pinterest APIs require approval and complex setup.
                        Late.dev provides instant access to post to both platforms without the hassle.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gradient-to-r from-[#4285F4]/20 to-[#34A853]/20 text-[var(--text-secondary)]">
                            ✓ Google Business Profile
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#E60023]/20 text-[var(--text-secondary)]">
                            ✓ Pinterest
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
