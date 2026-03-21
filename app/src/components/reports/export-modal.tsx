/**
 * Export Modal Component
 * UI for exporting reports in various formats with flexible scheduling
 * and delivery format options (PDF, live link, or both).
 */

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
    X, Download, FileText, Table, Calendar,
    Check, Loader2, Mail, Clock, Link2, Copy,
    Globe, Trash2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportType: 'analytics' | 'revenue' | 'posts' | 'engagement';
}

type DeliveryFormat = 'pdf' | 'link' | 'both';

interface ScheduledReportItem {
    id: string;
    name: string;
    schedule: string;
    recipients: string[];
    deliveryFormat: string;
    shareToken: string | null;
    isActive: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
}

export function ExportModal({ isOpen, onClose, reportType }: ExportModalProps) {
    const queryClient = useQueryClient();
    const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
    const [dateRange, setDateRange] = useState('30d');
    const [isExporting, setIsExporting] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [showManageSchedules, setShowManageSchedules] = useState(false);

    // Schedule form state
    const [scheduleName, setScheduleName] = useState(`${reportType} Report`);
    const [scheduleFrequency, setScheduleFrequency] = useState('weekly');
    const [scheduleEmail, setScheduleEmail] = useState('');
    const [deliveryFormat, setDeliveryFormat] = useState<DeliveryFormat>('pdf');
    const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);

    // Fetch existing schedules
    const { data: schedulesData } = useQuery({
        queryKey: ['scheduled-reports'],
        queryFn: async () => {
            const res = await fetch('/api/reports/schedule');
            if (!res.ok) return { data: [] };
            return res.json() as Promise<{ data: ScheduledReportItem[] }>;
        },
        enabled: showManageSchedules,
    });

    // Create schedule mutation
    const createScheduleMutation = useMutation({
        mutationFn: async () => {
            const cronMap: Record<string, string> = {
                daily: '0 9 * * *',
                weekly: '0 9 * * 1',
                monthly: '0 9 1 * *',
            };

            const res = await fetch('/api/reports/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: scheduleName,
                    schedule: cronMap[scheduleFrequency] || '0 9 * * 1',
                    recipients: scheduleEmail.split(',').map(e => e.trim()).filter(Boolean),
                    deliveryFormat,
                    config: {
                        type: reportType,
                        dateRange,
                    },
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create schedule');
            }

            return res.json();
        },
        onSuccess: (data) => {
            toast('success', 'Report schedule created');
            if (data.data?.shareUrl) {
                setLastShareUrl(data.data.shareUrl);
            }
            queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
        },
        onError: (err: Error) => {
            toast('error', err.message);
        },
    });

    // Toggle schedule active state
    const toggleScheduleMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            const res = await fetch('/api/reports/schedule', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive }),
            });
            if (!res.ok) throw new Error('Failed to update');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
            toast('success', 'Schedule updated');
        },
    });

    // Delete schedule
    const deleteScheduleMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/reports/schedule?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
            toast('success', 'Schedule deleted');
        },
    });

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

    const handleCreateSchedule = async () => {
        if (!scheduleEmail.trim()) {
            toast('error', 'Please enter at least one recipient email');
            return;
        }
        await createScheduleMutation.mutateAsync();
    };

    const copyShareUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        toast('success', 'Link copied to clipboard');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-[var(--bg-secondary)] p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">
                        {showManageSchedules ? 'Scheduled Reports' : 'Export Report'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {showManageSchedules ? (
                    // ============================================================
                    // Manage Schedules View
                    // ============================================================
                    <div className="space-y-3">
                        {(!schedulesData?.data || schedulesData.data.length === 0) ? (
                            <div className="text-center py-8">
                                <Clock className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No scheduled reports yet</p>
                            </div>
                        ) : (
                            schedulesData.data.map((schedule) => (
                                <div
                                    key={schedule.id}
                                    className="rounded-lg border p-4"
                                    style={{ borderColor: 'var(--border)' }}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm">{schedule.name}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => toggleScheduleMutation.mutate({ id: schedule.id, isActive: !schedule.isActive })}
                                                className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
                                                title={schedule.isActive ? 'Pause' : 'Activate'}
                                            >
                                                {schedule.isActive
                                                    ? <ToggleRight className="h-5 w-5" style={{ color: 'var(--success)' }} />
                                                    : <ToggleLeft className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                                                }
                                            </button>
                                            <button
                                                onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                                className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" style={{ color: 'var(--error)' }} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                        <span className="capitalize">{schedule.deliveryFormat}</span>
                                        <span>·</span>
                                        <span>{schedule.recipients.length} recipient{schedule.recipients.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    {schedule.shareToken && schedule.isActive && (
                                        <button
                                            onClick={() => copyShareUrl(`${window.location.origin}/shared-report/${schedule.shareToken}`)}
                                            className="flex items-center gap-1.5 mt-2 text-xs px-2 py-1 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
                                            style={{ color: 'var(--accent-gold)' }}
                                        >
                                            <Copy className="h-3 w-3" />
                                            Copy live link
                                        </button>
                                    )}
                                </div>
                            ))
                        )}

                        <Button
                            variant="secondary"
                            onClick={() => setShowManageSchedules(false)}
                            className="w-full"
                        >
                            ← Back to export
                        </Button>
                    </div>
                ) : (
                    // ============================================================
                    // Main Export View
                    // ============================================================
                    <>
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
                                            Get reports delivered to your email or as a live link
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
                                    {/* Report Name */}
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                            Report name
                                        </label>
                                        <input
                                            type="text"
                                            value={scheduleName}
                                            onChange={(e) => setScheduleName(e.target.value)}
                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                                        />
                                    </div>

                                    {/* Frequency */}
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                            Frequency
                                        </label>
                                        <select
                                            value={scheduleFrequency}
                                            onChange={(e) => setScheduleFrequency(e.target.value)}
                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly (Mondays)</option>
                                            <option value="monthly">Monthly (1st)</option>
                                        </select>
                                    </div>

                                    {/* Delivery Format */}
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                            Delivery format
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { value: 'pdf' as const, label: 'PDF', icon: <FileText className="h-3.5 w-3.5" /> },
                                                { value: 'link' as const, label: 'Live Link', icon: <Globe className="h-3.5 w-3.5" /> },
                                                { value: 'both' as const, label: 'Both', icon: <Link2 className="h-3.5 w-3.5" /> },
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => setDeliveryFormat(option.value)}
                                                    className={cn(
                                                        'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors',
                                                        deliveryFormat === option.value
                                                            ? 'bg-[var(--accent-gold)] text-white'
                                                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/80'
                                                    )}
                                                >
                                                    {option.icon}
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Recipients */}
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--text-muted)]">
                                            Send to (comma-separated)
                                        </label>
                                        <input
                                            type="email"
                                            value={scheduleEmail}
                                            onChange={(e) => setScheduleEmail(e.target.value)}
                                            placeholder="email@example.com"
                                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
                                        />
                                    </div>

                                    {/* Created Share URL */}
                                    {lastShareUrl && (
                                        <div className="rounded-lg border border-[var(--accent-gold)] bg-[var(--accent-gold-light)] p-3">
                                            <p className="text-xs font-medium mb-1" style={{ color: 'var(--accent-gold)' }}>
                                                Live Report Link
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={lastShareUrl}
                                                    className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs font-mono truncate"
                                                />
                                                <button
                                                    onClick={() => copyShareUrl(lastShareUrl)}
                                                    className="rounded-md bg-[var(--accent-gold)] p-1.5 text-white transition-transform active:scale-95"
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Save Schedule Button */}
                                    <Button
                                        onClick={handleCreateSchedule}
                                        disabled={createScheduleMutation.isPending}
                                        className="w-full"
                                    >
                                        {createScheduleMutation.isPending ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Calendar className="h-4 w-4" />
                                                Save Schedule
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            {/* Manage Existing Schedules */}
                            <button
                                onClick={() => setShowManageSchedules(true)}
                                className="mt-2 flex items-center gap-1.5 text-xs px-1 transition-colors hover:underline"
                                style={{ color: 'var(--accent-gold)' }}
                            >
                                <Clock className="h-3 w-3" />
                                Manage scheduled reports
                            </button>
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
                    </>
                )}
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
