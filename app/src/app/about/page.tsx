/**
 * About page — who we are and what Overseek Socials does.
 * Why: Builds trust for potential customers and satisfies OAuth provider
 * requirements for a clear company presence.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
    title: 'About | Overseek Socials',
    description: 'Learn about Overseek Socials, the AI-powered social media management platform built for agencies and brands.',
};

/** Values displayed in the "What We Believe" grid */
const VALUES = [
    {
        title: 'AI That Empowers',
        description: 'Our AI augments your creativity rather than replacing it. Every suggestion is a starting point you can refine.',
        icon: '✨',
    },
    {
        title: 'Transparency First',
        description: 'Honest pricing, clear data practices, and no hidden fees. You always know what you\'re getting.',
        icon: '🔍',
    },
    {
        title: 'Built for Teams',
        description: 'From solo creators to agencies managing 50+ brands, collaboration is at our core.',
        icon: '👥',
    },
    {
        title: 'Platform Agnostic',
        description: 'We go where your audience is. Publish everywhere from one place, without vendor lock-in.',
        icon: '🌐',
    },
] as const;

export default function AboutPage() {
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
                {/* Hero */}
                <h1 className="text-3xl font-extrabold md:text-4xl">
                    About <span className="text-gradient">Overseek Socials</span>
                </h1>
                <p className="mt-4 text-lg leading-relaxed text-[var(--text-secondary)]">
                    Overseek Socials is an AI-powered social media management platform built by
                    SocialiseIT. We help agencies and brands take full control of their social presence,
                    from content creation and scheduling to analytics and reputation management.
                </p>

                {/* Mission */}
                <section className="mt-12">
                    <h2 className="text-xl font-bold">Our Mission</h2>
                    <div className="glass-card mt-4 rounded-2xl p-6">
                        <p className="text-[var(--text-secondary)] leading-relaxed">
                            Social media management shouldn&apos;t require five different tools and a
                            spreadsheet. We&apos;re building the single platform that replaces them all, with
                            AI that actually understands your brand voice, scheduling that adapts to your
                            audience, and analytics that connect posts to revenue.
                        </p>
                    </div>
                </section>

                {/* What We Believe */}
                <section className="mt-12">
                    <h2 className="mb-6 text-xl font-bold">What We Believe</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {VALUES.map((value) => (
                            <div key={value.title} className="glass-card card-hover rounded-2xl p-5">
                                <div className="mb-3 text-2xl">{value.icon}</div>
                                <h3 className="mb-1 font-semibold">{value.title}</h3>
                                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                                    {value.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* What We Support */}
                <section className="mt-12">
                    <h2 className="text-xl font-bold">Platforms We Support</h2>
                    <p className="mt-3 text-[var(--text-secondary)]">
                        Publish to <strong>Instagram</strong>, <strong>TikTok</strong>,{' '}
                        <strong>YouTube</strong>, <strong>Facebook</strong>,{' '}
                        <strong>Pinterest</strong>, <strong>Bluesky</strong>, and{' '}
                        <strong>Google Business Profile</strong>, all from one composer. Monitor and
                        respond to <strong>Google Reviews</strong> from a unified inbox.
                    </p>
                </section>

                {/* CTA */}
                <section className="mt-14 rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border)] p-8 text-center">
                    <h2 className="text-xl font-bold">Ready to get started?</h2>
                    <p className="mt-2 text-[var(--text-secondary)]">
                        Join growing teams and agencies already using Overseek Socials.
                    </p>
                    <div className="mt-6">
                        <Link href="/register">
                            <Button className="btn-interactive rounded-full px-8">
                                Create Your Account
                            </Button>
                        </Link>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] py-8">
                <div className="mx-auto max-w-3xl px-6">
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-[var(--text-muted)]">
                        <Link href="/legal/privacy" className="hover:text-[var(--accent-gold)] transition-colors">Privacy Policy</Link>
                        <Link href="/legal/terms" className="hover:text-[var(--accent-gold)] transition-colors">Terms of Service</Link>
                        <Link href="/legal/cookies" className="hover:text-[var(--accent-gold)] transition-colors">Cookies</Link>
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
