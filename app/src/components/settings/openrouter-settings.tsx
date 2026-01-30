'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Bot, Key, Check, AlertCircle, Loader2, Eye, EyeOff, ExternalLink, Search
} from 'lucide-react';

interface AIConfigData {
    isConfigured: boolean;
    apiKeyMasked: string | null;
    selectedModel: string | null;
    modelName: string | null;
}

interface OpenRouterModel {
    id: string;
    name: string;
    description: string;
    contextLength: number;
    promptPrice: string;
    completionPrice: string;
    modality: string;
}

export function OpenRouterSettings() {
    const [config, setConfig] = useState<AIConfigData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Model search state
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingModels, setLoadingModels] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);

    // Fetch config on mount
    useEffect(() => {
        fetchConfig();
    }, []);

    // Fetch models when config is ready and API key is configured
    useEffect(() => {
        if (config?.isConfigured) {
            fetchModels('');
        }
    }, [config?.isConfigured]);

    // Debounced model search
    useEffect(() => {
        if (!config?.isConfigured) return;
        const timer = setTimeout(() => {
            fetchModels(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, config?.isConfigured]);

    async function fetchConfig() {
        try {
            const res = await fetch('/api/settings/ai-config');
            const data = await res.json();
            setConfig(data.config);
        } catch (error) {
            console.error('Failed to fetch AI config:', error);
            setMessage({ type: 'error', text: 'Failed to load AI configuration' });
        } finally {
            setLoading(false);
        }
    }

    async function fetchModels(query: string) {
        setLoadingModels(true);
        try {
            const res = await fetch(`/api/openrouter/models?search=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                setModels(data.models || []);
            }
        } catch (error) {
            console.error('Failed to fetch models:', error);
        } finally {
            setLoadingModels(false);
        }
    }

    async function handleSaveApiKey() {
        if (!apiKey.trim() && !config?.isConfigured) {
            setMessage({ type: 'error', text: 'API key is required' });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/ai-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: apiKey.trim() || undefined }),
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

    async function handleSelectModel(model: OpenRouterModel) {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/ai-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedModel: model.id,
                    modelName: model.name,
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setMessage({ type: 'success', text: `Selected: ${model.name}` });
                setShowModelPicker(false);
                await fetchConfig();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to select model' });
            }
        } catch (error) {
            console.error('Failed to select model:', error);
            setMessage({ type: 'error', text: 'Failed to select model' });
        } finally {
            setSaving(false);
        }
    }

    /** Formats price per token to per 1M tokens for readability */
    function formatPrice(pricePerToken: string): string {
        const price = parseFloat(pricePerToken) * 1_000_000;
        if (price === 0) return 'Free';
        if (price < 0.01) return '<$0.01';
        return `$${price.toFixed(2)}`;
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
                    <Bot className="h-5 w-5 text-[var(--accent-gold)]" />
                    AI Integration (OpenRouter)
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Connect to OpenRouter to power AI features like caption generation
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

            {/* API Key Card */}
            <div className="card p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                        <Key className="h-5 w-5 text-[var(--accent-gold)]" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-medium text-sm">API Key</h4>
                        {config?.isConfigured ? (
                            <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                                <Check className="h-3 w-3" />
                                {config.apiKeyMasked}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs text-[var(--warning)]">
                                <AlertCircle className="h-3 w-3" />
                                Not configured
                            </span>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="relative">
                        <Input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={config?.isConfigured ? 'Enter new key to update' : 'Enter your OpenRouter API key'}
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

                    <div className="flex items-center justify-between">
                        <Button onClick={handleSaveApiKey} disabled={saving} className="text-sm">
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save API Key'
                            )}
                        </Button>
                        <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-[var(--accent-gold)] hover:underline"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Get API Key
                        </a>
                    </div>
                </div>
            </div>

            {/* Model Selection - Only show if API key is configured */}
            {config?.isConfigured && (
                <div className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h4 className="font-medium text-sm">Selected Model</h4>
                            {config.selectedModel ? (
                                <p className="text-sm text-[var(--text-muted)]">{config.modelName} ({config.selectedModel})</p>
                            ) : (
                                <p className="text-sm text-[var(--warning)]">No model selected</p>
                            )}
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => setShowModelPicker(!showModelPicker)}
                            className="text-sm"
                        >
                            {showModelPicker ? 'Close' : 'Change Model'}
                        </Button>
                    </div>

                    {showModelPicker && (
                        <div className="border-t border-[var(--border)] pt-4">
                            {/* Search Input */}
                            <div className="relative mb-4">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]">
                                    <Search className="h-4 w-4" />
                                </div>
                                <Input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search models..."
                                    className="pl-10"
                                />
                                {loadingModels && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--text-muted)]" />
                                )}
                            </div>

                            {/* Model List */}
                            <div className="max-h-80 overflow-y-auto space-y-2">
                                {models.length === 0 && !loadingModels ? (
                                    <p className="text-sm text-[var(--text-muted)] text-center py-4">
                                        No models found
                                    </p>
                                ) : (
                                    models.slice(0, 50).map((model) => (
                                        <button
                                            key={model.id}
                                            onClick={() => handleSelectModel(model)}
                                            disabled={saving}
                                            className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50 ${config.selectedModel === model.id
                                                ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                                : 'border-[var(--border)]'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm truncate">{model.name}</p>
                                                    <p className="text-xs text-[var(--text-muted)] truncate">{model.id}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-medium">{(model.contextLength / 1000).toFixed(0)}K ctx</p>
                                                    <p className="text-xs text-[var(--text-muted)]">
                                                        {formatPrice(model.promptPrice)}/M
                                                    </p>
                                                </div>
                                            </div>
                                            {model.description && (
                                                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                                                    {model.description}
                                                </p>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
