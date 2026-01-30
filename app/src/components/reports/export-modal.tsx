/**
 * Export Modal Component
 * UI for exporting reports in various formats
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    X, Download, FileText, Table, Calendar,
    Check, Loader2, Mail, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportType: 'analytics' | 'revenue' | 'posts' | 'engagement';
}

export function ExportModal({ isOpen, onClose, reportType }: ExportModalProps) {
    const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
    const [dateRange, setDateRange] = useState('30d');
    const [isExporting, setIsExporting] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);

        // Simulate export
        await new Promise((r) => setTimeout(r, 1500));

        // In production, call reports service
        const blob = new Blob(['Sample CSV data'], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${reportType}-report-${Date.now()}.${format}`;
        link.click();
        URL.revokeObjectURL(url);

        setIsExporting(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Export Report</h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Report Type */}
                <div className="mb-6 rounded-lg bg-[var(--bg-tertiary)] p-4">
                    <p className="text-sm text-[var(--text-muted)]">Report type</p>
                    <p className="font-medium capitalize">{reportType} Report</p>
                </div>

                {/* Date Range */}
                <div className="mb-6">
                    <label className="mb-2 block text-sm font-medium">Date Range</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { value: '7d', label: '7 days' },
                            { value: '30d', label: '30 days' },
                            { value: '90d', label: '90 days' },
                            { value: 'custom', label: 'Custom' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setDateRange(option.value)}
                                className={cn(
                                    'rounded-lg py-2 text-sm font-medium transition-colors',
                                    dateRange === option.value
                                        ? 'bg-[var(--accent-gold)] text-white'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Format */}
                <div className="mb-6">
                    <label className="mb-2 block text-sm font-medium">Format</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setFormat('csv')}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border-2 p-4 transition-colors',
                                format === 'csv'
                                    ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                    : 'border-[var(--border)] hover:border-[var(--accent-gold)]'
                            )}
                        >
                            <Table className="h-6 w-6 text-[var(--accent-gold)]" />
                            <div className="text-left">
                                <p className="font-medium">CSV</p>
                                <p className="text-xs text-[var(--text-muted)]">Spreadsheet</p>
                            </div>
                        </button>
                        <button
                            onClick={() => setFormat('pdf')}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border-2 p-4 transition-colors',
                                format === 'pdf'
                                    ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                    : 'border-[var(--border)] hover:border-[var(--accent-gold)]'
                            )}
                        >
                            <FileText className="h-6 w-6 text-[var(--accent-gold)]" />
                            <div className="text-left">
                                <p className="font-medium">PDF</p>
                                <p className="text-xs text-[var(--text-muted)]">Document</p>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Schedule Option */}
                <div className="mb-6">
                    <button
                        onClick={() => setShowSchedule(!showSchedule)}
                        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] p-4 text-left hover:bg-[var(--bg-tertiary)]"
                    >
                        <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-[var(--accent-gold)]" />
                            <div>
                                <p className="font-medium">Schedule recurring export</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    Get reports delivered to your email
                                </p>
                            </div>
                        </div>
                        <div
                            className={cn(
                                'h-5 w-5 rounded border-2 transition-colors',
                                showSchedule
                                    ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]'
                                    : 'border-[var(--border)]'
                            )}
                        >
                            {showSchedule && <Check className="h-full w-full text-white" />}
                        </div>
                    </button>

                    {showSchedule && (
                        <div className="mt-3 space-y-3 rounded-lg bg-[var(--bg-tertiary)] p-4">
                            <div>
                                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                    Frequency
                                </label>
                                <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
                                    <option>Weekly (Mondays)</option>
                                    <option>Monthly (1st)</option>
                                    <option>Daily</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                    Send to
                                </label>
                                <input
                                    type="email"
                                    placeholder="email@example.com"
                                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        Cancel
                    </Button>
                    <Button onClick={handleExport} disabled={isExporting} className="flex-1">
                        {isExporting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                Export
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * Export Button with dropdown
 */
interface ExportButtonProps {
    onExport: (format: 'csv' | 'pdf') => void;
}

export function ExportButton({ onExport }: ExportButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <Button variant="secondary" onClick={() => setIsOpen(!isOpen)}>
                <Download className="h-4 w-4" />
                Export
            </Button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 shadow-lg">
                        <button
                            onClick={() => {
                                onExport('csv');
                                setIsOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)]"
                        >
                            <Table className="h-4 w-4" />
                            Export as CSV
                        </button>
                        <button
                            onClick={() => {
                                onExport('pdf');
                                setIsOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)]"
                        >
                            <FileText className="h-4 w-4" />
                            Export as PDF
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
