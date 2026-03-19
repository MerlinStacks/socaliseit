'use client';

/**
 * Dashboard Error Boundary
 * Why: Catches unhandled errors in any dashboard route and shows a branded
 * recovery UI instead of the raw Next.js error screen. Next.js requires
 * error.tsx to be a client component.
 */

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ErrorPageProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        logger.error({ err: error, digest: error.digest }, 'Dashboard route error');
    }, [error]);

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-8 animate-fade-in">
            <div className="max-w-md w-full text-center">
                {/* Error Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-[var(--error-light)] flex items-center justify-center">
                        <AlertTriangle className="w-10 h-10 text-[var(--error)]" />
                    </div>
                </div>

                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    Something went wrong
                </h2>
                <p className="text-[var(--text-secondary)] mb-6">
                    We hit an unexpected error loading this page. You can try again or head back to the dashboard.
                </p>

                {/* Dev-only error details */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="mb-6 p-4 rounded-lg bg-[var(--bg-tertiary)] text-left overflow-auto max-h-40">
                        <p className="text-xs font-mono text-[var(--error)]">
                            {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs font-mono text-[var(--text-muted)] mt-1">
                                Digest: {error.digest}
                            </p>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={reset} className="btn-interactive">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => window.location.href = '/dashboard'}
                    >
                        <Home className="w-4 h-4 mr-2" />
                        Go Home
                    </Button>
                    <Button
                        variant="ghost"
                        className="text-[var(--accent-gold)]"
                        onClick={() => {
                            const subject = encodeURIComponent(`Bug Report: ${error.message}`);
                            const body = encodeURIComponent(
                                `Error: ${error.message}\nDigest: ${error.digest || 'N/A'}\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}`
                            );
                            window.open(`mailto:support@socialiseit.com?subject=${subject}&body=${body}`, '_blank');
                        }}
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Report Issue
                    </Button>
                </div>
            </div>
        </div>
    );
}
