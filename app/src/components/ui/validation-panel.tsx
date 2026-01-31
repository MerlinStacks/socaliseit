/**
 * Validation Panel Component
 * Real-time validation checklist with categorized severity levels
 * Features slide-in animations and interactive fix buttons
 */

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    CheckCircle,
    AlertCircle,
    AlertTriangle,
    Info,
    ChevronDown,
    ChevronUp,
    Wrench
} from 'lucide-react';
import { Button } from './button';

export type ValidationSeverity = 'error' | 'warning' | 'info' | 'success';

export interface ValidationRule {
    id: string;
    severity: ValidationSeverity;
    message: string;
    description?: string;
    /** If provided, shows a "Fix" button that calls this function */
    onFix?: () => void | Promise<void>;
    /** Whether the fix is currently being applied */
    isFixing?: boolean;
}

interface ValidationPanelProps {
    rules: ValidationRule[];
    title?: string;
    /** Whether the panel is initially collapsed */
    defaultCollapsed?: boolean;
    className?: string;
}

const severityConfig = {
    error: {
        icon: AlertCircle,
        bgColor: 'bg-[var(--error-light)]',
        textColor: 'text-[var(--error)]',
        borderColor: 'border-l-[var(--error)]',
        label: 'Error',
    },
    warning: {
        icon: AlertTriangle,
        bgColor: 'bg-[var(--warning-light)]',
        textColor: 'text-[var(--warning)]',
        borderColor: 'border-l-[var(--warning)]',
        label: 'Warning',
    },
    info: {
        icon: Info,
        bgColor: 'bg-[var(--info-light)]',
        textColor: 'text-[var(--info)]',
        borderColor: 'border-l-[var(--info)]',
        label: 'Info',
    },
    success: {
        icon: CheckCircle,
        bgColor: 'bg-[var(--success-light)]',
        textColor: 'text-[var(--success)]',
        borderColor: 'border-l-[var(--success)]',
        label: 'Passed',
    },
};

/**
 * Displays a list of validation rules with categorized severity.
 * Supports collapsible sections and interactive fix buttons.
 */
export function ValidationPanel({
    rules,
    title = 'Validation',
    defaultCollapsed = false,
    className,
}: ValidationPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

    const errorCount = rules.filter(r => r.severity === 'error').length;
    const warningCount = rules.filter(r => r.severity === 'warning').length;
    const successCount = rules.filter(r => r.severity === 'success').length;

    // Sort by severity: errors first, then warnings, then info, then success
    const sortedRules = [...rules].sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2, success: 3 };
        return order[a.severity] - order[b.severity];
    });

    return (
        <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]', className)}>
            {/* Header */}
            <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="font-medium">{title}</span>
                    <div className="flex items-center gap-2">
                        {errorCount > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-[var(--error-light)] px-2 py-0.5 text-xs font-medium text-[var(--error)]">
                                {errorCount} error{errorCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        {warningCount > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-[var(--warning-light)] px-2 py-0.5 text-xs font-medium text-[var(--warning)]">
                                {warningCount} warning{warningCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        {errorCount === 0 && warningCount === 0 && successCount > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-2 py-0.5 text-xs font-medium text-[var(--success)]">
                                All passed
                            </span>
                        )}
                    </div>
                </div>
                {isCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                ) : (
                    <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                )}
            </button>

            {/* Rules List */}
            {!isCollapsed && (
                <div className="border-t border-[var(--border)] divide-y divide-[var(--border-light)]">
                    {sortedRules.length === 0 ? (
                        <div className="p-4 text-center text-sm text-[var(--text-muted)]">
                            No validation rules
                        </div>
                    ) : (
                        sortedRules.map((rule, index) => (
                            <ValidationRuleItem
                                key={rule.id}
                                rule={rule}
                                style={{ animationDelay: `${index * 50}ms` }}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

interface ValidationRuleItemProps {
    rule: ValidationRule;
    style?: React.CSSProperties;
}

function ValidationRuleItem({ rule, style }: ValidationRuleItemProps) {
    const config = severityConfig[rule.severity];
    const Icon = config.icon;
    const [isFixing, setIsFixing] = useState(false);

    const handleFix = async () => {
        if (!rule.onFix) return;
        setIsFixing(true);
        try {
            await rule.onFix();
        } finally {
            setIsFixing(false);
        }
    };

    return (
        <div
            className={cn(
                'flex items-start gap-3 p-3 border-l-4 animate-slide-up',
                config.borderColor,
                config.bgColor
            )}
            style={style}
        >
            <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.textColor)} />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                    {rule.message}
                </p>
                {rule.description && (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {rule.description}
                    </p>
                )}
            </div>
            {rule.onFix && (
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleFix}
                    isLoading={isFixing || rule.isFixing}
                    className="flex-shrink-0"
                >
                    <Wrench className="h-3 w-3" />
                    Fix
                </Button>
            )}
        </div>
    );
}

/**
 * Compact validation badge for headers/toolbars
 * Shows error/warning counts and triggers panel on click
 */
interface ValidationBadgeProps {
    errorCount: number;
    warningCount: number;
    onClick?: () => void;
    className?: string;
}

export function ValidationBadge({
    errorCount,
    warningCount,
    onClick,
    className
}: ValidationBadgeProps) {
    const hasIssues = errorCount > 0 || warningCount > 0;

    if (!hasIssues) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
                    'bg-[var(--success-light)] text-[var(--success)]',
                    'transition-all hover:opacity-80',
                    className
                )}
            >
                <CheckCircle className="h-3.5 w-3.5" />
                Valid
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium',
                errorCount > 0
                    ? 'bg-[var(--error-light)] text-[var(--error)]'
                    : 'bg-[var(--warning-light)] text-[var(--warning)]',
                'transition-all hover:opacity-80',
                className
            )}
        >
            {errorCount > 0 && (
                <span className="flex items-center gap-0.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {errorCount}
                </span>
            )}
            {warningCount > 0 && (
                <span className="flex items-center gap-0.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {warningCount}
                </span>
            )}
        </button>
    );
}
