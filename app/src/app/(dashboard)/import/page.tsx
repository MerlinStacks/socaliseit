/**
 * Bulk Import Page
 * Import posts from CSV files
 */

'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Upload, FileSpreadsheet, Check, X, AlertTriangle,
    Download, ArrowRight, Loader2, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportRow {
    rowNumber: number;
    caption: string;
    platforms: string[];
    scheduledAt?: string;
    status: 'valid' | 'warning' | 'error';
    errors: string[];
    warnings: string[];
}

export default function ImportPage() {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState({ imported: 0, skipped: 0, failed: 0 });

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Mock parsing
        const mockRows: ImportRow[] = [
            {
                rowNumber: 1,
                caption: 'New product launch! 🚀 Check it out!',
                platforms: ['instagram', 'tiktok'],
                scheduledAt: '2024-02-01 10:00',
                status: 'valid',
                errors: [],
                warnings: [],
            },
            {
                rowNumber: 2,
                caption: 'Behind the scenes of our latest shoot 📸',
                platforms: ['instagram'],
                scheduledAt: '2024-02-02 14:30',
                status: 'warning',
                errors: [],
                warnings: ['Scheduled date is in the past'],
            },
            {
                rowNumber: 3,
                caption: '',
                platforms: ['tiktok'],
                scheduledAt: '2024-02-03 09:00',
                status: 'error',
                errors: ['Caption is required'],
                warnings: [],
            },
            {
                rowNumber: 4,
                caption: 'Quick tip: How to style our bestseller ✨',
                platforms: ['instagram', 'tiktok', 'pinterest'],
                scheduledAt: '2024-02-04 11:00',
                status: 'valid',
                errors: [],
                warnings: [],
            },
        ];

        setRows(mockRows);
        setStep('preview');
    }, []);

    const handleImport = async () => {
        setStep('importing');

        const validRows = rows.filter(r => r.status !== 'error');

        for (let i = 0; i <= 100; i += 20) {
            await new Promise(r => setTimeout(r, 500));
            setProgress(i);
        }

        setResults({
            imported: validRows.length,
            skipped: rows.filter(r => r.status === 'error').length,
            failed: 0,
        });
        setStep('complete');
    };

    const validCount = rows.filter(r => r.status === 'valid').length;
    const warningCount = rows.filter(r => r.status === 'warning').length;
    const errorCount = rows.filter(r => r.status === 'error').length;

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <FileSpreadsheet className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Bulk Import</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Import posts from CSV
                        </p>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => { }}>
                    <Download className="h-4 w-4" />
                    Download Template
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="mx-auto max-w-4xl">
                    {/* Step: Upload */}
                    {step === 'upload' && (
                        <div className="text-center">
                            <label className="block cursor-pointer">
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] p-16 transition-colors hover:border-[var(--accent-gold)]">
                                    <Upload className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                                    <h3 className="mt-4 text-lg font-semibold">Upload CSV File</h3>
                                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                                        Drag and drop or click to browse
                                    </p>
                                    <Button className="mt-6">
                                        <Upload className="h-4 w-4" />
                                        Select File
                                    </Button>
                                </div>
                            </label>

                            {/* Format Guide */}
                            <div className="mt-8 text-left">
                                <h3 className="font-semibold mb-3">CSV Format</h3>
                                <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 font-mono text-xs overflow-x-auto">
                                    <div className="text-[var(--text-muted)]">caption,platforms,scheduled_date,scheduled_time,pillar,hashtags</div>
                                    <div>"Your caption here",instagram|tiktok,2024-02-01,10:00,Promotional,hashtag1|hashtag2</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step: Preview */}
                    {step === 'preview' && (
                        <>
                            {/* Summary */}
                            <div className="mb-6 grid grid-cols-3 gap-4">
                                <div className="card flex items-center gap-4 p-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--success-light)]">
                                        <Check className="h-5 w-5 text-[var(--success)]" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{validCount}</p>
                                        <p className="text-sm text-[var(--text-muted)]">Valid rows</p>
                                    </div>
                                </div>
                                <div className="card flex items-center gap-4 p-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--warning-light)]">
                                        <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{warningCount}</p>
                                        <p className="text-sm text-[var(--text-muted)]">Warnings</p>
                                    </div>
                                </div>
                                <div className="card flex items-center gap-4 p-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--error-light)]">
                                        <X className="h-5 w-5 text-[var(--error)]" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{errorCount}</p>
                                        <p className="text-sm text-[var(--text-muted)]">Errors (will skip)</p>
                                    </div>
                                </div>
                            </div>

                            {/* Preview Table */}
                            <div className="card overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--bg-tertiary)] text-left text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                                            <th className="p-4 w-16">Row</th>
                                            <th className="p-4">Caption</th>
                                            <th className="p-4">Platforms</th>
                                            <th className="p-4">Scheduled</th>
                                            <th className="p-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.rowNumber} className="border-b border-[var(--border)] last:border-0">
                                                <td className="p-4 text-[var(--text-muted)]">{row.rowNumber}</td>
                                                <td className="p-4 max-w-xs truncate">{row.caption || <span className="text-[var(--error)]">Missing</span>}</td>
                                                <td className="p-4">{row.platforms.join(', ')}</td>
                                                <td className="p-4">{row.scheduledAt || '-'}</td>
                                                <td className="p-4">
                                                    {row.status === 'valid' && (
                                                        <span className="flex items-center gap-1 text-[var(--success)]">
                                                            <Check className="h-4 w-4" /> Valid
                                                        </span>
                                                    )}
                                                    {row.status === 'warning' && (
                                                        <span className="flex items-center gap-1 text-[var(--warning)]" title={row.warnings.join(', ')}>
                                                            <AlertTriangle className="h-4 w-4" /> Warning
                                                        </span>
                                                    )}
                                                    {row.status === 'error' && (
                                                        <span className="flex items-center gap-1 text-[var(--error)]" title={row.errors.join(', ')}>
                                                            <X className="h-4 w-4" /> Error
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Actions */}
                            <div className="mt-6 flex justify-end gap-3">
                                <Button variant="secondary" onClick={() => { setRows([]); setStep('upload'); }}>
                                    Cancel
                                </Button>
                                <Button onClick={handleImport} disabled={validCount + warningCount === 0}>
                                    Import {validCount + warningCount} Posts
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Step: Importing */}
                    {step === 'importing' && (
                        <div className="text-center py-16">
                            <Loader2 className="mx-auto h-12 w-12 animate-spin text-[var(--accent-gold)]" />
                            <h3 className="mt-6 text-xl font-semibold">Importing Posts...</h3>
                            <div className="mx-auto mt-6 max-w-xs">
                                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                    <div
                                        className="h-full rounded-full bg-gradient transition-all"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <p className="mt-2 text-sm text-[var(--text-muted)]">{progress}%</p>
                            </div>
                        </div>
                    )}

                    {/* Step: Complete */}
                    {step === 'complete' && (
                        <div className="text-center py-16">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success-light)]">
                                <Check className="h-8 w-8 text-[var(--success)]" />
                            </div>
                            <h3 className="mt-6 text-xl font-semibold">Import Complete!</h3>
                            <p className="mt-2 text-[var(--text-muted)]">
                                {results.imported} posts imported successfully
                            </p>
                            {results.skipped > 0 && (
                                <p className="text-sm text-[var(--warning)]">
                                    {results.skipped} rows skipped due to errors
                                </p>
                            )}
                            <div className="mt-8 flex justify-center gap-3">
                                <Button variant="secondary" onClick={() => { setRows([]); setStep('upload'); }}>
                                    Import More
                                </Button>
                                <Button onClick={() => window.location.href = '/calendar'}>
                                    <FileText className="h-4 w-4" />
                                    View in Calendar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
