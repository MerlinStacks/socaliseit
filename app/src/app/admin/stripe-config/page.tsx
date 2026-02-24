'use client';

/**
 * Admin Stripe Configuration Page
 *
 * Why: Allows super admins to input/update Stripe API keys, price IDs,
 * and checkout config directly from the admin panel instead of editing
 * environment variables.
 */

import { useState, useEffect, useCallback } from 'react';
import { clientLogger } from '@/lib/client-logger';
import {
    Key,
    Save,
    Trash2,
    Eye,
    EyeOff,
    AlertCircle,
    CheckCircle,
    Loader2,
    Zap,
    CreditCard,
    Shield,
    TestTube2,
} from 'lucide-react';

interface StripeConfigData {
    configured: boolean;
    secretKeyMasked: string;
    publishableKey: string;
    webhookSecretMasked: string;
    proPriceId: string;
    businessPriceId: string;
    enterprisePriceId: string;
    trialDays: number;
}

interface FormState {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    proPriceId: string;
    businessPriceId: string;
    enterprisePriceId: string;
    trialDays: string;
}

const INITIAL_FORM: FormState = {
    secretKey: '',
    publishableKey: '',
    webhookSecret: '',
    proPriceId: '',
    businessPriceId: '',
    enterprisePriceId: '',
    trialDays: '0',
};

export default function StripeConfigPage() {
    const [config, setConfig] = useState<StripeConfigData | null>(null);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showSecretKey, setShowSecretKey] = useState(false);
    const [showWebhookSecret, setShowWebhookSecret] = useState(false);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/stripe-config');
            if (!res.ok) throw new Error('Failed to load Stripe config');
            const data: StripeConfigData = await res.json();
            setConfig(data);
            setForm({
                secretKey: '',
                publishableKey: data.publishableKey || '',
                webhookSecret: '',
                proPriceId: data.proPriceId || '',
                businessPriceId: data.businessPriceId || '',
                enterprisePriceId: data.enterprisePriceId || '',
                trialDays: String(data.trialDays || 0),
            });
        } catch (err) {
            clientLogger.error({ err: String(err) }, 'Failed to load Stripe config');
            setMessage({ type: 'error', text: 'Failed to load Stripe config' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const payload: Record<string, unknown> = {};
            if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
            if (form.publishableKey.trim()) payload.publishableKey = form.publishableKey.trim();
            if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
            payload.proPriceId = form.proPriceId;
            payload.businessPriceId = form.businessPriceId;
            payload.enterprisePriceId = form.enterprisePriceId;
            payload.trialDays = parseInt(form.trialDays, 10) || 0;

            const res = await fetch('/api/admin/stripe-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Failed to save' });
                return;
            }

            setMessage({ type: 'success', text: 'Stripe configuration saved successfully' });
            await fetchConfig();
        } catch (err) {
            clientLogger.error({ err: String(err) }, 'Failed to save Stripe config');
            setMessage({ type: 'error', text: 'Failed to save Stripe config' });
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        if (!form.secretKey.trim()) {
            setMessage({ type: 'error', text: 'Enter a Secret Key to test the connection' });
            return;
        }
        setTesting(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/stripe-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: form.secretKey.trim() }),
            });
            const data = await res.json();

            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Connection test failed' });
                return;
            }

            setMessage({
                type: 'success',
                text: `Connection successful — Mode: ${data.mode}, Currency: ${data.currency}`,
            });
        } catch (err) {
            clientLogger.error({ err: String(err) }, 'Stripe connection test failed');
            setMessage({ type: 'error', text: 'Connection test failed' });
        } finally {
            setTesting(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to remove all Stripe configuration? Billing features will be disabled.')) {
            return;
        }
        setDeleting(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/stripe-config', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete config');

            setMessage({ type: 'success', text: 'Stripe configuration removed' });
            setForm(INITIAL_FORM);
            await fetchConfig();
        } catch (err) {
            clientLogger.error({ err: String(err) }, 'Failed to delete Stripe config');
            setMessage({ type: 'error', text: 'Failed to delete Stripe config' });
        } finally {
            setDeleting(false);
        }
    };

    const updateField = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-white/40" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <CreditCard className="h-7 w-7 text-purple-400" />
                    Stripe Configuration
                </h1>
                <p className="text-sm text-white/50 mt-1">
                    Manage Stripe API keys, price IDs, and checkout settings.
                </p>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-3">
                <span
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${config?.configured
                        ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                        : 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                        }`}
                >
                    {config?.configured ? (
                        <>
                            <CheckCircle className="h-3.5 w-3.5" /> Configured
                        </>
                    ) : (
                        <>
                            <AlertCircle className="h-3.5 w-3.5" /> Not Configured
                        </>
                    )}
                </span>
                {config?.configured && config.secretKeyMasked && (
                    <span className="text-xs text-white/30">
                        Secret: {config.secretKeyMasked}
                    </span>
                )}
            </div>

            {/* Success / Error message */}
            {message && (
                <div
                    className={`p-4 rounded-xl border ${message.type === 'success'
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                        } flex items-center gap-3`}
                >
                    {message.type === 'success' ? (
                        <CheckCircle className="h-5 w-5 shrink-0" />
                    ) : (
                        <AlertCircle className="h-5 w-5 shrink-0" />
                    )}
                    <span className="text-sm">{message.text}</span>
                </div>
            )}

            {/* API Keys Section */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                    <Shield className="h-5 w-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white">API Keys</h2>
                </div>
                <div className="p-6 space-y-5">
                    {/* Publishable Key */}
                    <div>
                        <label htmlFor="publishable-key" className="block text-sm font-medium text-white/70 mb-1.5">
                            Publishable Key
                        </label>
                        <input
                            id="publishable-key"
                            type="text"
                            value={form.publishableKey}
                            onChange={(e) => updateField('publishableKey', e.target.value)}
                            placeholder="pk_test_..."
                            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition font-mono text-sm"
                        />
                    </div>

                    {/* Secret Key */}
                    <div>
                        <label htmlFor="secret-key" className="block text-sm font-medium text-white/70 mb-1.5">
                            Secret Key
                            {config?.configured && (
                                <span className="ml-2 text-xs text-white/30">
                                    (leave blank to keep current)
                                </span>
                            )}
                        </label>
                        <div className="relative">
                            <input
                                id="secret-key"
                                type={showSecretKey ? 'text' : 'password'}
                                value={form.secretKey}
                                onChange={(e) => updateField('secretKey', e.target.value)}
                                placeholder={config?.configured ? config.secretKeyMasked || 'sk_test_...' : 'sk_test_...'}
                                className="w-full px-4 py-2.5 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowSecretKey(!showSecretKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                            >
                                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Webhook Secret */}
                    <div>
                        <label htmlFor="webhook-secret" className="block text-sm font-medium text-white/70 mb-1.5">
                            Webhook Secret
                            {config?.configured && config.webhookSecretMasked && (
                                <span className="ml-2 text-xs text-white/30">
                                    (leave blank to keep current)
                                </span>
                            )}
                        </label>
                        <div className="relative">
                            <input
                                id="webhook-secret"
                                type={showWebhookSecret ? 'text' : 'password'}
                                value={form.webhookSecret}
                                onChange={(e) => updateField('webhookSecret', e.target.value)}
                                placeholder={config?.webhookSecretMasked || 'whsec_...'}
                                className="w-full px-4 py-2.5 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                            >
                                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Test Connection */}
                    <button
                        onClick={handleTestConnection}
                        disabled={testing || !form.secretKey.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {testing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <TestTube2 className="h-4 w-4" />
                        )}
                        Test Connection
                    </button>
                </div>
            </section>

            {/* Price IDs Section */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                    <Zap className="h-5 w-5 text-amber-400" />
                    <h2 className="text-lg font-semibold text-white">Price IDs</h2>
                </div>
                <div className="p-6 space-y-5">
                    <p className="text-xs text-white/40 -mt-1">
                        Stripe Price IDs for each subscription tier. Find these in your{' '}
                        <a
                            href="https://dashboard.stripe.com/products"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 underline"
                        >
                            Stripe Dashboard → Products
                        </a>
                        .
                    </p>

                    {/* Pro */}
                    <div>
                        <label htmlFor="pro-price" className="block text-sm font-medium text-white/70 mb-1.5">
                            Pro Price ID
                        </label>
                        <input
                            id="pro-price"
                            type="text"
                            value={form.proPriceId}
                            onChange={(e) => updateField('proPriceId', e.target.value)}
                            placeholder="price_..."
                            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition font-mono text-sm"
                        />
                    </div>

                    {/* Business */}
                    <div>
                        <label htmlFor="business-price" className="block text-sm font-medium text-white/70 mb-1.5">
                            Business Price ID
                        </label>
                        <input
                            id="business-price"
                            type="text"
                            value={form.businessPriceId}
                            onChange={(e) => updateField('businessPriceId', e.target.value)}
                            placeholder="price_..."
                            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition font-mono text-sm"
                        />
                    </div>

                    {/* Enterprise */}
                    <div>
                        <label htmlFor="enterprise-price" className="block text-sm font-medium text-white/70 mb-1.5">
                            Enterprise Price ID
                        </label>
                        <input
                            id="enterprise-price"
                            type="text"
                            value={form.enterprisePriceId}
                            onChange={(e) => updateField('enterprisePriceId', e.target.value)}
                            placeholder="price_..."
                            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition font-mono text-sm"
                        />
                    </div>
                </div>
            </section>

            {/* Checkout Config Section */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                    <Key className="h-5 w-5 text-blue-400" />
                    <h2 className="text-lg font-semibold text-white">Checkout Settings</h2>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <label htmlFor="trial-days" className="block text-sm font-medium text-white/70 mb-1.5">
                            Trial Period (days)
                        </label>
                        <input
                            id="trial-days"
                            type="number"
                            min="0"
                            value={form.trialDays}
                            onChange={(e) => updateField('trialDays', e.target.value)}
                            placeholder="0"
                            className="w-40 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition text-sm"
                        />
                        <p className="text-xs text-white/40 mt-1.5">
                            Set to 0 to disable free trials. Applies to new subscriptions only.
                        </p>
                    </div>
                </div>
            </section>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    Save Configuration
                </button>

                {config?.configured && (
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {deleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="h-4 w-4" />
                        )}
                        Remove Config
                    </button>
                )}
            </div>
        </div>
    );
}
