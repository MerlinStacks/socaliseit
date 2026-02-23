/**
 * Public status page — service health overview.
 * Why: Builds trust by showing transparency around uptime.
 * Currently uses hardcoded statuses — can be connected to
 * a monitoring service (e.g., UptimeRobot API) later.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
    title: 'System Status | Overseek Socials',
    description: 'Check the current status of Overseek Socials services.',
};

/** Service definitions — update statuses as needed */
const SERVICES = [
    { name: 'Web Application', status: 'operational' as const, description: 'Dashboard, composer, and media library' },
    { name: 'API', status: 'operational' as const, description: 'REST API and authentication' },
    { name: 'Publishing Engine', status: 'operational' as const, description: 'Post scheduling and platform publishing' },
    { name: 'Analytics', status: 'operational' as const, description: 'Engagement metrics and performance data' },
    { name: 'AI Content Engine', status: 'operational' as const, description: 'Caption generation and brand voice AI' },
    { name: 'Review Management', status: 'operational' as const, description: 'Google Business review sync and replies' },
] as const;

type ServiceStatus = 'operational' | 'degraded' | 'partial-outage' | 'major-outage';

/** Status display config */
const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bgColor: string }> = {
    'operational': { label: 'Operational', color: 'var(--success)', bgColor: 'var(--success-light)' },
    'degraded': { label: 'Degraded', color: 'var(--warning)', bgColor: 'var(--warning-light)' },
    'partial-outage': { label: 'Partial Outage', color: 'var(--warning)', bgColor: 'var(--warning-light)' },
    'major-outage': { label: 'Major Outage', color: 'var(--error)', bgColor: 'var(--error-light)' },
};

export default function StatusPublicPage() {
    const allOperational = SERVICES.every((s) => s.status === 'operational');

    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="sticky top-0 z-10 glass border-b border-[var(--border)]">
                <div className="mx-auto max-w-3xl px-6 py-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-6 py-12">
                <h1 className="text-3xl font-extrabold md:text-4xl">
                    System <span className="text-gradient">Status</span>
                </h1>

                {/* Overall status banner */}
                <div
                    className="mt-8 flex items-center gap-3 rounded-2xl p-5"
                    style={{
                        backgroundColor: allOperational ? 'var(--success-light)' : 'var(--warning-light)',
                        border: `1px solid ${allOperational ? 'var(--success)' : 'var(--warning)'}`,
                    }}
                >
                    <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: allOperational ? 'var(--success)' : 'var(--warning)' }}
                    />
                    <span className="font-semibold">
                        {allOperational ? 'All Systems Operational' : 'Some Systems Experiencing Issues'}
                    </span>
                </div>

                {/* Service list */}
                <div className="mt-8 space-y-3">
                    {SERVICES.map((service) => {
                        const config = STATUS_CONFIG[service.status];
                        return (
                            <div
                                key={service.name}
                                className="glass-card flex items-center justify-between rounded-2xl p-5"
                            >
                                <div>
                                    <h3 className="font-semibold">{service.name}</h3>
                                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{service.description}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: config.color }}
                                    />
                                    <span
                                        className="text-sm font-medium"
                                        style={{ color: config.color }}
                                    >
                                        {config.label}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Info note */}
                <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
                    This page is updated manually. For real-time support, email{' '}
                    <a href="mailto:support@socialiseit.com" className="text-[var(--accent-gold)] hover:underline">
                        support@socialiseit.com
                    </a>
                </p>
            </main>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] py-8">
                <div className="mx-auto max-w-3xl px-6">
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-[var(--text-muted)]">
                        <Link href="/legal/privacy" className="hover:text-[var(--accent-gold)] transition-colors">Privacy Policy</Link>
                        <Link href="/legal/terms" className="hover:text-[var(--accent-gold)] transition-colors">Terms of Service</Link>
                        <Link href="/about" className="hover:text-[var(--accent-gold)] transition-colors">About</Link>
                        <Link href="/contact" className="hover:text-[var(--accent-gold)] transition-colors">Contact</Link>
                    </div>
                    <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                        © {new Date().getFullYear()} Overseek Socials. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
