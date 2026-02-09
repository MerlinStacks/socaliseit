'use client';

/**
 * Meta API Tests — Super Admin Page
 * Run all 12 Meta Graph API permission test calls to satisfy App Review requirements.
 * Why: Meta requires verified API test calls for each permission before granting advanced access.
 */

import { useState, useEffect } from 'react';
import {
    FlaskConical,
    Play,
    Loader2,
    CheckCircle,
    XCircle,
    SkipForward,
    Clock,
    AlertCircle,
    ChevronDown,
} from 'lucide-react';

interface Account {
    id: string;
    platform: string;
    name: string;
    username: string | null;
    platformId: string;
    organization: { name: string };
}

interface TestResult {
    permission: string;
    status: 'passed' | 'failed' | 'skipped';
    message: string;
    responseTime: number;
    endpoint?: string;
}

interface TestSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
}

const STATUS_CONFIG = {
    passed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', label: 'Passed' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Failed' },
    skipped: { icon: SkipForward, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Skipped' },
};

export default function MetaApiTestsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<TestResult[]>([]);
    const [summary, setSummary] = useState<TestSummary | null>(null);
    const [testedAccount, setTestedAccount] = useState<{ name: string; platform: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            const res = await fetch('/api/admin/meta-api-tests');
            const data = await res.json();
            setAccounts(data.accounts || []);
            if (data.accounts?.length > 0) {
                setSelectedAccountId(data.accounts[0].id);
            }
        } catch (err) {
            setError('Failed to load accounts');
        } finally {
            setLoading(false);
        }
    };

    const runTests = async () => {
        setRunning(true);
        setError(null);
        setResults([]);
        setSummary(null);

        try {
            const res = await fetch('/api/admin/meta-api-tests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccountId || undefined }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to run tests');
                return;
            }

            setResults(data.results);
            setSummary(data.summary);
            setTestedAccount(data.account);
        } catch (err) {
            setError('Failed to run tests — check console for details');
        } finally {
            setRunning(false);
        }
    };

    const totalResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-3 text-gray-400">Loading accounts...</span>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <FlaskConical className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Meta API Tests</h1>
                        <p className="text-gray-400 text-sm">
                            Run all 33 Meta permission test calls required for App Review
                        </p>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-6 rounded-lg p-4 flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    {error}
                </div>
            )}

            {/* Controls */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Test Account
                        </label>
                        {accounts.length === 0 ? (
                            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                                No Facebook, Instagram, or Threads accounts connected. Connect one in Settings first.
                            </div>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedAccountId}
                                    onChange={(e) => setSelectedAccountId(e.target.value)}
                                    disabled={running}
                                    className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 pr-10 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                                >
                                    {accounts.map((acc) => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.name} ({acc.platform}) — {acc.organization.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            </div>
                        )}
                    </div>
                    <button
                        onClick={runTests}
                        disabled={running || accounts.length === 0}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                        {running ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Running Tests...
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4" />
                                Run All Tests
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Summary Bar */}
            {summary && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
                        <p className="text-2xl font-bold text-white">{summary.total}</p>
                        <p className="text-xs text-gray-400 mt-1">Total</p>
                    </div>
                    <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
                        <p className="text-2xl font-bold text-green-400">{summary.passed}</p>
                        <p className="text-xs text-green-400/70 mt-1">Passed</p>
                    </div>
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                        <p className="text-2xl font-bold text-red-400">{summary.failed}</p>
                        <p className="text-xs text-red-400/70 mt-1">Failed</p>
                    </div>
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
                        <p className="text-2xl font-bold text-yellow-400">{summary.skipped}</p>
                        <p className="text-xs text-yellow-400/70 mt-1">Skipped</p>
                    </div>
                </div>
            )}

            {/* Results Table */}
            {results.length > 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-gray-800">
                        <h2 className="font-medium text-white">Test Results</h2>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Clock className="h-4 w-4" />
                            Total: {(totalResponseTime / 1000).toFixed(1)}s
                        </div>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {results.map((result, idx) => {
                            const config = STATUS_CONFIG[result.status];
                            const StatusIcon = config.icon;

                            return (
                                <div
                                    key={idx}
                                    className="flex items-start gap-4 p-4 hover:bg-gray-800/30 transition-colors"
                                >
                                    {/* Status Icon */}
                                    <div className={`mt-0.5 ${config.color}`}>
                                        <StatusIcon className="h-5 w-5" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <code className="text-sm font-medium text-white">
                                                {result.permission}
                                            </code>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.border} border ${config.color}`}>
                                                {config.label}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400 break-all">
                                            {result.message}
                                        </p>
                                        {result.endpoint && (
                                            <code className="text-xs text-gray-600 mt-1 block">
                                                {result.endpoint}
                                            </code>
                                        )}
                                    </div>

                                    {/* Response Time */}
                                    {result.responseTime > 0 && (
                                        <div className="text-right shrink-0">
                                            <span className="text-sm text-gray-500">
                                                {result.responseTime}ms
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    {testedAccount && (
                        <div className="p-4 border-t border-gray-800 bg-gray-950/50">
                            <p className="text-xs text-gray-500">
                                Tested with: {testedAccount.name} ({testedAccount.platform})
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {results.length === 0 && !running && accounts.length > 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
                    <FlaskConical className="h-12 w-12 text-gray-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-300 mb-2">No tests run yet</h3>
                    <p className="text-gray-500 text-sm max-w-md mx-auto">
                        Select a connected Facebook, Instagram, or Threads account and click &quot;Run All Tests&quot;
                        to verify all Meta API permissions are working correctly.
                    </p>
                </div>
            )}
        </div>
    );
}
