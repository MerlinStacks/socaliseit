'use client';

/**
 * API Integrations Admin Page
 * Configure third-party API integrations (Late.dev for Google Business, etc.)
 */

import { useState, useEffect } from 'react';
import {
    Plug2,
    Save,
    Key,
    Eye,
    EyeOff,
    AlertCircle,
    CheckCircle,
    ExternalLink,
    TestTube,
} from 'lucide-react';

interface IntegrationSettings {
    lateApiKey: string | null;
    lateProfileId: string | null;
    isConfigured: boolean;
}

export default function IntegrationsPage() {
    const [settings, setSettings] = useState<IntegrationSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form state
    const [lateApiKey, setLateApiKey] = useState('');
    const [lateProfileId, setLateProfileId] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/integrations');
            const data = await res.json();
            setSettings(data);
            if (data.lateProfileId) {
                setLateProfileId(data.lateProfileId);
            }
        } catch (error) {
            console.error('Failed to fetch integration settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/integrations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lateApiKey: lateApiKey || undefined,
                    lateProfileId: lateProfileId || undefined,
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Integration settings saved successfully' });
                setLateApiKey('');
                await fetchSettings();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.error || 'Failed to save settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        setTesting(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/integrations/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: lateApiKey || undefined,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: data.message });
            } else {
                setMessage({ type: 'error', text: data.error || 'Connection test failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to test connection' });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-gray-400">Loading integration settings...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">API Integrations</h1>
                <p className="text-gray-400 mt-1">
                    Configure third-party API integrations for extended platform support.
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

            <div className="space-y-6">
                {/* Late.dev Integration */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-indigo-500 flex items-center justify-center">
                                <Plug2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white">Late.dev</h2>
                                <p className="text-sm text-gray-400">
                                    Enables Google Business Profile and Pinterest connections
                                </p>
                            </div>
                        </div>
                        <a
                            href="https://getlate.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300"
                        >
                            <span className="text-sm">Documentation</span>
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    </div>

                    <div className="space-y-4">
                        {/* API Key */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={lateApiKey}
                                    onChange={(e) => setLateApiKey(e.target.value)}
                                    placeholder={settings?.isConfigured ? settings.lateApiKey || '••••••••' : 'Enter Late.dev API key'}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {settings?.isConfigured && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Leave blank to keep existing API key
                                </p>
                            )}
                        </div>

                        {/* Profile ID */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Profile ID
                            </label>
                            <input
                                type="text"
                                value={lateProfileId}
                                onChange={(e) => setLateProfileId(e.target.value)}
                                placeholder="Optional: Your Late.dev profile ID"
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Found in your Late.dev dashboard under Settings
                            </p>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2 pt-2">
                            <div className={`h-2 w-2 rounded-full ${settings?.isConfigured ? 'bg-green-500' : 'bg-gray-500'}`} />
                            <span className={`text-sm ${settings?.isConfigured ? 'text-green-400' : 'text-gray-400'}`}>
                                {settings?.isConfigured ? 'Connected' : 'Not configured'}
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
                            <button
                                onClick={testConnection}
                                disabled={testing || (!lateApiKey && !settings?.isConfigured)}
                                className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                            >
                                <TestTube className="h-4 w-4" />
                                {testing ? 'Testing...' : 'Test Connection'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        onClick={saveSettings}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        <Save className="h-4 w-4" />
                        {saving ? 'Saving...' : 'Save Integration Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
