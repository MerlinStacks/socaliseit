'use client';

/**
 * Error Boundary Component
 * Catches React errors and displays user-friendly error UI with reporting
 */

import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, MessageSquare, Home } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

// ============================================================================
// Error Boundary Class Component
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        this.setState({ errorInfo });

        // Call custom error handler if provided
        this.props.onError?.(error, errorInfo);

        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.error('ErrorBoundary caught an error:', error, errorInfo);
        }

        // In production, would send to error tracking service like Sentry
        // Example: Sentry.captureException(error, { extra: errorInfo });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleReportIssue = () => {
        const { error, errorInfo } = this.state;
        const errorDetails = {
            message: error?.message || 'Unknown error',
            stack: error?.stack || '',
            componentStack: errorInfo?.componentStack || '',
            url: typeof window !== 'undefined' ? window.location.href : '',
            timestamp: new Date().toISOString(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        };

        // Create mailto link with error details
        const subject = encodeURIComponent(`Bug Report: ${error?.message || 'Application Error'}`);
        const body = encodeURIComponent(
            `Hi Overseek Socials Team,\n\n` +
            `I encountered an error while using the application.\n\n` +
            `--- Error Details ---\n` +
            `Message: ${errorDetails.message}\n` +
            `URL: ${errorDetails.url}\n` +
            `Timestamp: ${errorDetails.timestamp}\n\n` +
            `--- Steps to Reproduce ---\n` +
            `[Please describe what you were doing when this error occurred]\n\n` +
            `--- Additional Context ---\n` +
            `[Any other relevant information]\n\n` +
            `--- Technical Details ---\n` +
            `${errorDetails.stack?.slice(0, 500)}`
        );

        window.open(`mailto:support@socialiseit.com?subject=${subject}&body=${body}`, '_blank');
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[400px] flex items-center justify-center p-8">
                    <div className="max-w-md w-full text-center">
                        {/* Error Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="w-20 h-20 rounded-2xl bg-[var(--error-light)] flex items-center justify-center">
                                <AlertTriangle className="w-10 h-10 text-[var(--error)]" />
                            </div>
                        </div>

                        {/* Error Message */}
                        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                            Something went wrong
                        </h2>
                        <p className="text-[var(--text-secondary)] mb-6">
                            We&apos;re sorry, but something unexpected happened. Our team has been notified.
                        </p>

                        {/* Error Details (Development Only) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mb-6 p-4 rounded-lg bg-[var(--bg-tertiary)] text-left overflow-auto max-h-40">
                                <p className="text-xs font-mono text-[var(--error)]">
                                    {this.state.error.message}
                                </p>
                                {this.state.error.stack && (
                                    <pre className="text-xs font-mono text-[var(--text-muted)] mt-2 whitespace-pre-wrap">
                                        {this.state.error.stack.slice(0, 300)}...
                                    </pre>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button
                                onClick={this.handleRetry}
                                className="btn-interactive"
                            >
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
                                onClick={this.handleReportIssue}
                                className="text-[var(--accent-gold)]"
                            >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Report Issue
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// ============================================================================
// Hook for Functional Components
// ============================================================================

/**
 * Wrapper component for easier use in functional components
 */
interface ErrorBoundaryWrapperProps {
    children: ReactNode;
    fallbackMessage?: string;
}

export function WithErrorBoundary({ children, fallbackMessage }: ErrorBoundaryWrapperProps) {
    return (
        <ErrorBoundary
            fallback={
                fallbackMessage ? (
                    <div className="p-4 rounded-lg bg-[var(--error-light)] text-[var(--error)] text-sm">
                        {fallbackMessage}
                    </div>
                ) : undefined
            }
        >
            {children}
        </ErrorBoundary>
    );
}

// ============================================================================
// Reset Error Boundary Context
// ============================================================================

import { createContext, useContext } from 'react';

const ErrorBoundaryContext = createContext<{ reset: () => void } | null>(null);

export function useErrorBoundary() {
    const context = useContext(ErrorBoundaryContext);
    if (!context) {
        throw new Error('useErrorBoundary must be used within an ErrorBoundary');
    }
    return context;
}
