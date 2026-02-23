/**
 * Changelog page — version history and recent updates.
 * Why: Keeps users informed about new features and fixes,
 * and demonstrates the product is actively developed.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Changelog | Overseek Socials',
    description: 'See what\'s new in Overseek Socials. Latest features, improvements, and fixes.',
};

/** Changelog entries — add newest first */
const CHANGELOG = [
    {
        version: '1.4.0',
        date: 'February 2026',
        tag: 'Latest',
        changes: [
            'Added AI-powered Brand Voice training for more consistent captions',
            'New content calendar month view with drag-and-drop scheduling',
            'Bluesky publishing support',
            'Google Business review management with sentiment tracking',
            'Performance improvements for large media libraries',
        ],
    },
    {
        version: '1.3.0',
        date: 'January 2026',
        tag: null,
        changes: [
            'Pinterest publishing support with board selection',
            'Analytics export to PDF and CSV for Pro plans and above',
            'Team collaboration with role-based access control',
            'Activity logging for workspace audit trails',
            'Mobile PWA improvements: camera capture and bottom navigation',
        ],
    },
    {
        version: '1.2.0',
        date: 'December 2025',
        tag: null,
        changes: [
            'TikTok publishing with privacy level controls',
            'YouTube Shorts support',
            'AI caption generation with virality scoring',
            'Competitor tracking (Pro and above)',
            'Engagement inbox for cross-platform comment management',
        ],
    },
    {
        version: '1.1.0',
        date: 'November 2025',
        tag: null,
        changes: [
            'Facebook and Instagram publishing',
            'Content calendar with week view',
            'Media library with upload and organization',
            'Basic analytics dashboard',
            'Team invitations and workspace setup',
        ],
    },
    {
        version: '1.0.0',
        date: 'October 2025',
        tag: null,
        changes: [
            'Initial release',
            'Instagram publishing and scheduling',
            'AI caption suggestions',
            'User authentication and onboarding',
            'Content composer with multi-platform preview',
        ],
    },
] as const;

export default function ChangelogPage() {
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
                    <span className="text-gradient">Changelog</span>
                </h1>
                <p className="mt-4 text-lg text-[var(--text-secondary)]">
                    What&apos;s new in Overseek Socials. We ship updates regularly.
                </p>

                {/* Timeline */}
                <div className="relative mt-12">
                    {/* Vertical line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />

                    <div className="space-y-10">
                        {CHANGELOG.map((entry) => (
                            <div key={entry.version} className="relative pl-8">
                                {/* Dot */}
                                <div
                                    className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 ${entry.tag
                                        ? 'border-[var(--accent-gold)] bg-gradient'
                                        : 'border-[var(--border)] bg-[var(--bg-secondary)]'
                                        }`}
                                />

                                <div className="glass-card rounded-2xl p-6">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="text-lg font-bold">v{entry.version}</h2>
                                        <span className="text-sm text-[var(--text-muted)]">{entry.date}</span>
                                        {entry.tag && (
                                            <span className="rounded-full bg-gradient px-3 py-0.5 text-xs font-semibold text-white">
                                                {entry.tag}
                                            </span>
                                        )}
                                    </div>
                                    <ul className="mt-4 space-y-2">
                                        {entry.changes.map((change) => (
                                            <li key={change} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                                                <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                                {change}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
