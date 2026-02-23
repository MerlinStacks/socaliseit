/**
 * Contact page — how to reach the Overseek Socials team.
 * Why: OAuth providers (Google, Meta, TikTok) require a way
 * for users to contact the developer.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mail, Clock, MessageCircle } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Contact | Overseek Socials',
    description: 'Get in touch with the Overseek Socials team for support, questions, or partnerships.',
};

/** Support channel cards */
const CHANNELS = [
    {
        icon: Mail,
        title: 'Email Support',
        description: 'For general enquiries and account help.',
        action: 'support@socialiseit.com',
        href: 'mailto:support@socialiseit.com',
    },
    {
        icon: MessageCircle,
        title: 'Privacy & Data',
        description: 'For privacy concerns and data requests.',
        action: 'privacy@socialiseit.com',
        href: 'mailto:privacy@socialiseit.com',
    },
    {
        icon: Clock,
        title: 'Response Times',
        description: 'We aim to respond within 24 hours on business days. Priority support customers get faster responses.',
        action: null,
        href: null,
    },
] as const;

export default function ContactPage() {
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
                    Get in <span className="text-gradient">Touch</span>
                </h1>
                <p className="mt-4 text-lg text-[var(--text-secondary)]">
                    Have questions, feedback, or need help? We&apos;d love to hear from you.
                </p>

                {/* Contact channels */}
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    {CHANNELS.map((channel) => (
                        <div key={channel.title} className="glass-card rounded-2xl p-6 text-center">
                            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient text-white">
                                <channel.icon className="h-5 w-5" />
                            </div>
                            <h3 className="mb-2 font-semibold">{channel.title}</h3>
                            <p className="mb-3 text-sm text-[var(--text-secondary)]">
                                {channel.description}
                            </p>
                            {channel.href && (
                                <a
                                    href={channel.href}
                                    className="text-sm font-medium text-[var(--accent-gold)] hover:underline break-all"
                                >
                                    {channel.action}
                                </a>
                            )}
                        </div>
                    ))}
                </div>

                {/* Additional info */}
                <section className="mt-12 rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8">
                    <h2 className="text-xl font-bold">Before You Reach Out</h2>
                    <ul className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                        <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[var(--accent-gold)]">→</span>
                            <span>Check our <Link href="/faq" className="font-medium text-[var(--accent-gold)] hover:underline">FAQ page</Link> for answers to common questions.</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[var(--accent-gold)]">→</span>
                            <span>For data deletion requests, use our <Link href="/legal/data-deletion" className="font-medium text-[var(--accent-gold)] hover:underline">Data Deletion page</Link>.</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <span className="mt-0.5 text-[var(--accent-gold)]">→</span>
                            <span>Review our <Link href="/legal/privacy" className="font-medium text-[var(--accent-gold)] hover:underline">Privacy Policy</Link> for information about how we handle your data.</span>
                        </li>
                    </ul>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] py-8">
                <div className="mx-auto max-w-3xl px-6">
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-[var(--text-muted)]">
                        <Link href="/legal/privacy" className="hover:text-[var(--accent-gold)] transition-colors">Privacy Policy</Link>
                        <Link href="/legal/terms" className="hover:text-[var(--accent-gold)] transition-colors">Terms of Service</Link>
                        <Link href="/legal/cookies" className="hover:text-[var(--accent-gold)] transition-colors">Cookies</Link>
                        <Link href="/about" className="hover:text-[var(--accent-gold)] transition-colors">About</Link>
                    </div>
                    <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                        © {new Date().getFullYear()} Overseek Socials. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
