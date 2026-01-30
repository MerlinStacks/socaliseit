/**
 * Validation Panel Component
 * Shows real-time validation results with auto-fix suggestions
 */

'use client';

import { useMemo } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    validatePost,
    getValidationSummary,
    type ValidationContext,
    type ValidationResult,
} from '@/lib/validation';

interface ValidationPanelProps {
    context: ValidationContext;
    onAutoFix?: (ruleId: string) => void;
    className?: string;
}

export function ValidationPanel({ context, onAutoFix, className }: ValidationPanelProps) {
    const results = useMemo(() => validatePost(context), [context]);
    const summary = useMemo(() => getValidationSummary(results), [results]);

    return (
        <div className={cn('rounded-lg bg-[var(--bg-tertiary)] p-4', className)}>
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Pre-Publish Validation</span>
                    {summary.errors > 0 && (
                        <span className="rounded-full bg-[var(--error-light)] px-2 py-0.5 text-xs font-semibold text-[var(--error)]">
                            {summary.errors} Error{summary.errors > 1 ? 's' : ''}
                        </span>
                    )}
                    {summary.warnings > 0 && (
                        <span className="rounded-full bg-[var(--warning-light)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                            {summary.warnings} Warning{summary.warnings > 1 ? 's' : ''}
                        </span>
                    )}
                    {summary.errors === 0 && summary.warnings === 0 && (
                        <span className="rounded-full bg-[var(--success-light)] px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
                            All Passed
                        </span>
                    )}
                </div>
                <button className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <RefreshCw className="h-3 w-3" />
                    Revalidate
                </button>
            </div>

            {/* Results */}
            <div className="space-y-2">
                {Array.from(results.entries()).map(([ruleId, result]) => (
                    <ValidationItem
                        key={ruleId}
                        ruleId={ruleId}
                        result={result}
                        onAutoFix={onAutoFix ? () => onAutoFix(ruleId) : undefined}
                    />
                ))}
            </div>

            {/* Publish Status */}
            <div
                className={cn(
                    'mt-4 rounded-lg p-3 text-center text-sm font-medium',
                    summary.canPublish
                        ? 'bg-[var(--success-light)] text-[var(--success)]'
                        : 'bg-[var(--error-light)] text-[var(--error)]'
                )}
            >
                {summary.canPublish ? (
                    <span className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Ready to publish
                    </span>
                ) : (
                    <span className="flex items-center justify-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Fix {summary.errors} error{summary.errors > 1 ? 's' : ''} before publishing
                    </span>
                )}
            </div>
        </div>
    );
}

interface ValidationItemProps {
    ruleId: string;
    result: ValidationResult;
    onAutoFix?: () => void;
}

function ValidationItem({ ruleId, result, onAutoFix }: ValidationItemProps) {
    const icons = {
        pass: CheckCircle,
        warning: AlertTriangle,
        error: AlertCircle,
    };

    const colors = {
        pass: 'text-[var(--success)]',
        warning: 'text-[var(--warning)]',
        error: 'text-[var(--error)]',
    };

    const Icon = icons[result.status];

    return (
        <div className="flex items-start gap-3 py-1">
            <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', colors[result.status])} />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-secondary)]">{result.message}</p>
                {result.details && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{result.details}</p>
                )}
            </div>
            {result.canAutoFix && onAutoFix && (
                <button
                    onClick={onAutoFix}
                    className="flex items-center gap-1 rounded-md bg-[var(--accent-gold-light)] px-2 py-1 text-xs font-medium text-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-white"
                >
                    <Zap className="h-3 w-3" />
                    Fix
                </button>
            )}
        </div>
    );
}

/**
 * Compact validation badge for toolbars
 */
interface ValidationBadgeProps {
    context: ValidationContext;
    onClick?: () => void;
}

export function ValidationBadge({ context, onClick }: ValidationBadgeProps) {
    const results = useMemo(() => validatePost(context), [context]);
    const summary = useMemo(() => getValidationSummary(results), [results]);

    if (summary.errors > 0) {
        return (
            <button
                onClick={onClick}
                className="flex items-center gap-2 rounded-lg bg-[var(--error-light)] px-3 py-1.5 text-xs font-medium text-[var(--error)]"
            >
                <AlertCircle className="h-3.5 w-3.5" />
                {summary.errors} error{summary.errors > 1 ? 's' : ''}
            </button>
        );
    }

    if (summary.warnings > 0) {
        return (
            <button
                onClick={onClick}
                className="flex items-center gap-2 rounded-lg bg-[var(--warning-light)] px-3 py-1.5 text-xs font-medium text-[var(--warning)]"
            >
                <AlertTriangle className="h-3.5 w-3.5" />
                {summary.warnings} warning{summary.warnings > 1 ? 's' : ''}
            </button>
        );
    }

    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 rounded-lg bg-[var(--success-light)] px-3 py-1.5 text-xs font-medium text-[var(--success)]"
        >
            <CheckCircle className="h-3.5 w-3.5" />
            Valid
        </button>
    );
}
