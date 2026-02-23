/**
 * Feature comparison page — Overseek Socials vs competitors.
 * Why: Strong SEO play and helps visitors make purchasing decisions.
 * Comparisons are based on publicly available information.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
    title: 'Compare | Overseek Socials vs Hootsuite, Buffer, VistaSocial',
    description: 'See how Overseek Socials stacks up against Hootsuite, Buffer, and VistaSocial. Feature-by-feature comparison.',
};

/** Feature comparison rows */
const COMPARISON_FEATURES = [
    { feature: 'Instagram Publishing', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'TikTok Publishing', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'YouTube Publishing', overseek: true, hootsuite: true, buffer: false, vistasocial: true },
    { feature: 'Facebook Publishing', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'Pinterest Publishing', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'Bluesky Publishing', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'Google Business Profile', overseek: true, hootsuite: true, buffer: false, vistasocial: true },
    { feature: 'AI Caption Generation', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'Brand Voice AI Training', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'Virality Scoring', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'AI Comment Responses', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'Content Calendar', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'Drag & Drop Scheduling', overseek: true, hootsuite: true, buffer: false, vistasocial: true },
    { feature: 'Google Review Management', overseek: true, hootsuite: false, buffer: false, vistasocial: true },
    { feature: 'Competitor Tracking', overseek: true, hootsuite: true, buffer: false, vistasocial: true },
    { feature: 'E-commerce Attribution', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'Role-Based Access', overseek: true, hootsuite: true, buffer: false, vistasocial: true },
    { feature: 'Media Library', overseek: true, hootsuite: true, buffer: true, vistasocial: true },
    { feature: 'Engagement Inbox', overseek: true, hootsuite: true, buffer: false, vistasocial: true },
    { feature: 'Mobile PWA', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'Self-Hosted Option', overseek: true, hootsuite: false, buffer: false, vistasocial: false },
    { feature: 'Free Plan Available', overseek: true, hootsuite: false, buffer: true, vistasocial: false },
] as const;

/** Check / X indicator */
function StatusIcon({ supported }: { supported: boolean }) {
    if (supported) {
        return (
            <svg className="mx-auto h-5 w-5 text-[var(--success)]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
        );
    }
    return (
        <svg className="mx-auto h-5 w-5 text-[var(--text-muted)]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
    );
}

export default function ComparePage() {
    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="sticky top-0 z-10 glass border-b border-[var(--border)]">
                <div className="mx-auto max-w-5xl px-6 py-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-12">
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold md:text-4xl">
                        How We <span className="text-gradient">Compare</span>
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--text-secondary)]">
                        See why teams choose Overseek Socials over Hootsuite, Buffer, and VistaSocial.
                    </p>
                </div>

                {/* Comparison table */}
                <div className="mt-12 overflow-x-auto rounded-2xl border border-[var(--border)]">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-[var(--bg-secondary)]">
                                <th className="sticky left-0 z-10 bg-[var(--bg-secondary)] px-5 py-4 text-left font-semibold">Feature</th>
                                <th className="px-4 py-4 text-center font-semibold">
                                    <span className="text-gradient">Overseek</span>
                                </th>
                                <th className="px-4 py-4 text-center font-semibold text-[var(--text-secondary)]">Hootsuite</th>
                                <th className="px-4 py-4 text-center font-semibold text-[var(--text-secondary)]">Buffer</th>
                                <th className="px-4 py-4 text-center font-semibold text-[var(--text-secondary)]">VistaSocial</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPARISON_FEATURES.map((row, i) => (
                                <tr
                                    key={row.feature}
                                    className={i % 2 === 0 ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)]'}
                                >
                                    <td className="sticky left-0 z-10 px-5 py-3 font-medium" style={{ backgroundColor: 'inherit' }}>
                                        {row.feature}
                                    </td>
                                    <td className="px-4 py-3 text-center"><StatusIcon supported={row.overseek} /></td>
                                    <td className="px-4 py-3 text-center"><StatusIcon supported={row.hootsuite} /></td>
                                    <td className="px-4 py-3 text-center"><StatusIcon supported={row.buffer} /></td>
                                    <td className="px-4 py-3 text-center"><StatusIcon supported={row.vistasocial} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className="mt-4 text-xs text-[var(--text-muted)] text-center">
                    Comparison data based on publicly available information as of February 2026. Features may vary by plan tier.
                </p>

                {/* CTA */}
                <section className="mt-14 rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
                    <h2 className="text-xl font-bold">
                        Ready to switch to <span className="text-gradient">Overseek Socials</span>?
                    </h2>
                    <p className="mt-2 text-[var(--text-secondary)]">
                        Start free, no credit card required.
                    </p>
                    <div className="mt-6">
                        <Link href="/register">
                            <Button className="btn-interactive rounded-full px-8">
                                Get Started Free
                            </Button>
                        </Link>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] py-8">
                <div className="mx-auto max-w-5xl px-6">
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
