/**
 * Media Validation Badge Component
 * Shows per-media-item validation issues in the composer.
 * 
 * Why: Provides immediate feedback on media compatibility issues
 * directly on each thumbnail, not just in the global validation panel.
 */

'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    validateMediaItem,
    getMediaValidationSummary,
    getPlatformDisplayName,
    type MediaValidationIssue,
} from '@/lib/validation/media-validation';
import type { MediaInfo } from '@/lib/validation/types';
import { PlatformIcon } from './platform-icons';

interface MediaValidationBadgeProps {
    /** Media item to validate */
    media: MediaInfo;
    /** Selected platforms to validate against */
    platforms: string[];
    /** Post types per platform */
    postTypes: Record<string, string>;
    /** Size variant */
    size?: 'sm' | 'md';
    /** Additional CSS classes */
    className?: string;
}

/**
 * Badge overlay showing validation issues for a media item.
 * Click to expand detailed popover with platform-specific issues.
 */
export function MediaValidationBadge({
    media,
    platforms,
    postTypes,
    size = 'md',
    className,
}: MediaValidationBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);

    const issues = useMemo(
        () => validateMediaItem(media, platforms, postTypes),
        [media, platforms, postTypes]
    );

    const summary = useMemo(
        () => getMediaValidationSummary(issues),
        [issues]
    );

    // No issues, don't render anything
    if (issues.length === 0) {
        return null;
    }

    const hasErrors = summary.errorCount > 0;
    const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
    const badgeSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

    return (
        <div className={cn('relative', className)}>
            {/* Badge Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={cn(
                    'flex items-center justify-center rounded-lg transition-all',
                    badgeSize,
                    hasErrors
                        ? 'bg-[var(--error)] text-white'
                        : 'bg-[var(--warning)] text-white'
                )}
                title={`${summary.errorCount + summary.warningCount} issue${issues.length > 1 ? 's' : ''}`}
            >
                {hasErrors ? (
                    <AlertCircle className={iconSize} />
                ) : (
                    <AlertTriangle className={iconSize} />
                )}
            </button>

            {/* Popover */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    {/* Content */}
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl bg-[var(--bg-secondary)] p-4 shadow-2xl border border-[var(--border)]">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-sm font-semibold">Media Issues</h4>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <ChevronDown className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Issues grouped by platform */}
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {Object.entries(groupByPlatform(issues)).map(([platform, platformIssues]) => (
                                <div key={platform} className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <PlatformIcon platform={platform} className="h-4 w-4" />
                                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                                            {getPlatformDisplayName(platform)}
                                        </span>
                                    </div>
                                    {platformIssues.map((issue, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                'flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs',
                                                issue.severity === 'error'
                                                    ? 'bg-[var(--error-light)] text-[var(--error)]'
                                                    : 'bg-[var(--warning-light)] text-[var(--warning)]'
                                            )}
                                        >
                                            {issue.severity === 'error' ? (
                                                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                            ) : (
                                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                            )}
                                            <span>{issue.message}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Future Auto-Fix Button (Disabled) */}
                        {/* TODO: Enable when FFmpeg/Sharp processing is implemented */}
                        <button
                            disabled
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] cursor-not-allowed"
                            title="Coming soon: Auto-fix media for all platforms"
                        >
                            <Wrench className="h-3.5 w-3.5" />
                            Auto-Fix (Coming Soon)
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Compact inline badge for thumbnail strips.
 */
export function MediaValidationIndicator({
    media,
    platforms,
    postTypes,
}: {
    media: MediaInfo;
    platforms: string[];
    postTypes: Record<string, string>;
}) {
    const issues = useMemo(
        () => validateMediaItem(media, platforms, postTypes),
        [media, platforms, postTypes]
    );

    if (issues.length === 0) return null;

    const hasErrors = issues.some(i => i.severity === 'error');

    return (
        <div
            className={cn(
                'absolute top-1 right-1 h-3 w-3 rounded-full',
                hasErrors ? 'bg-[var(--error)]' : 'bg-[var(--warning)]'
            )}
            title={`${issues.length} issue${issues.length > 1 ? 's' : ''}`}
        />
    );
}

/**
 * Group issues by platform for display.
 */
function groupByPlatform(issues: MediaValidationIssue[]): Record<string, MediaValidationIssue[]> {
    return issues.reduce((acc, issue) => {
        if (!acc[issue.platform]) {
            acc[issue.platform] = [];
        }
        acc[issue.platform].push(issue);
        return acc;
    }, {} as Record<string, MediaValidationIssue[]>);
}
