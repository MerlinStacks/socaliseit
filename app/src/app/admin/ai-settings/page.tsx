'use client';

/**
 * AI Settings Admin Page
 * Configure OpenRouter API key and model selection for AI features
 */

import { useState, useEffect } from 'react';
import { clientLogger } from '@/lib/client-logger';
import {
    Bot,
    Save,
    Key,
    Eye,
    EyeOff,
    AlertCircle,
    CheckCircle,
    Sparkles,
    Search,
} from 'lucide-react';

interface AIConfig {
    isConfigured: boolean;
    apiKeyMasked: string | null;
    selectedModel: string | null;
    modelName: string | null;
    updatedAt: string | null;
}

interface AIModel {
    id: string;
    name: string;
    description: string;
    contextLength: number;
    promptPrice: string;
    completionPrice: string;
}

export default function AISettingsPage() {
    const [config, setConfig] = useState<AIConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form state
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [selectedModel, setSelectedModel] = useState('');
    const [modelName, setModelName] = useState('');

    // Models list
    const [models, setModels] = useState<AIModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [modelSearch, setModelSearch] = useState('');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/admin/ai-config');
            const data = await res.json();
            setConfig(data.config);
            if (data.config) {
                setSelectedModel(data.config.selectedModel || '');
                setModelName(data.config.modelName || '');
            }
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch AI config');
        } finally {
            setLoading(false);
        }
    };

    const fetchModels = async () => {
        setLoadingModels(true);
        try {
            const res = await fetch(`/api/openrouter/models?search=${encodeURIComponent(modelSearch)}`);
            const data = await res.json();
            if (data.models) {
                setModels(data.models.slice(0, 50));
            }
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch models');
        } finally {
            setLoadingModels(false);
        }
    };

    const saveConfig = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/admin/ai-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: apiKey || undefined,
                    selectedModel: selectedModel || undefined,
                    modelName: modelName || undefined,
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'AI settings saved successfully' });
                setApiKey('');
                await fetchConfig();
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

    const selectModel = (model: AIModel) => {
        setSelectedModel(model.id);
        setModelName(model.name);
        setModels([]);
        setModelSearch('');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-gray-400">Loading AI settings...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">AI Settings</h1>
                <p className="text-gray-400 mt-1">
                    Configure OpenRouter API for AI-powered features like caption generation and content suggestions.
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
                {/* API Key Section */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Key className="h-5 w-5 text-purple-400" />
                        <h2 className="text-lg font-semibold text-white">OpenRouter API Key</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={config?.isConfigured ? config.apiKeyMasked || '••••••••' : 'sk-or-v1-...'}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {config?.isConfigured && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Leave blank to keep existing API key
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Sparkles className="h-4 w-4" />
                            <span>Get your API key from</span>
                            <a
                                href="https://openrouter.ai/keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300"
                            >
                                openrouter.ai/keys
                            </a>
                        </div>
                    </div>
                </div>

                {/* Model Selection */}
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Bot className="h-5 w-5 text-blue-400" />
                        <h2 className="text-lg font-semibold text-white">AI Model</h2>
                    </div>

                    <div className="space-y-4">
                        {/* Selected Model Display */}
                        {selectedModel && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                <Bot className="h-5 w-5 text-blue-400" />
                                <div>
                                    <p className="font-medium text-white">{modelName || selectedModel}</p>
                                    <p className="text-sm text-gray-400">{selectedModel}</p>
                                </div>
                            </div>
                        )}

                        {/* Model Search */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Search Models
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    <input
                                        type="text"
                                        value={modelSearch}
                                        onChange={(e) => setModelSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchModels()}
                                        placeholder="Search for models (e.g., gpt-4, claude)..."
                                        className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                                <button
                                    onClick={fetchModels}
                                    disabled={loadingModels || !config?.isConfigured}
                                    className="rounded-lg bg-gray-700 px-4 py-2.5 text-white hover:bg-gray-600 disabled:opacity-50 transition-colors"
                                >
                                    {loadingModels ? 'Loading...' : 'Search'}
                                </button>
                            </div>
                            {!config?.isConfigured && (
                                <p className="mt-1 text-xs text-amber-400">
                                    Save your API key first to search models
                                </p>
                            )}
                        </div>

                        {/* Model Results */}
                        {models.length > 0 && (
                            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800">
                                {models.map((model) => (
                                    <button
                                        key={model.id}
                                        onClick={() => selectModel(model)}
                                        className="w-full text-left px-4 py-3 border-b border-gray-700 last:border-0 hover:bg-gray-700 transition-colors"
                                    >
                                        <p className="font-medium text-white">{model.name}</p>
                                        <p className="text-sm text-gray-400 truncate">{model.id}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        onClick={saveConfig}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                        <Save className="h-4 w-4" />
                        {saving ? 'Saving...' : 'Save AI Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
