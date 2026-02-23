/**
 * Standalone FAQ page at /faq.
 * Why: Provides a full FAQ experience for users who want more detail
 * than the landing page accordion offers. Uses the same design language
 * as the marketing pages for consistency.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** All FAQ entries — superset of what the landing page shows */
const FAQ_SECTIONS = [
    {
        title: 'Getting Started',
        items: [
            {
                question: 'What is Overseek Socials?',
                answer: 'Overseek Socials is an AI-powered social media management platform that lets agencies and brands schedule posts, track analytics, and manage engagement across multiple platforms from a single dashboard.',
            },
            {
                question: 'Which platforms are supported?',
                answer: 'We currently support Instagram, TikTok, YouTube, Facebook, Pinterest, Bluesky, and Google Business Profile. More platforms are on our roadmap.',
            },
            {
                question: 'Is there a free plan?',
                answer: 'Yes! Our Free plan includes 3 social accounts, 30 scheduled posts per month, and 10 AI content generations. No credit card required to get started.',
            },
        ],
    },
    {
        title: 'Features',
        items: [
            {
                question: 'How does the AI content engine work?',
                answer: 'Our AI learns your brand voice from existing content and generates on-brand captions with virality scoring. It also suggests optimal posting times based on your audience engagement patterns.',
            },
            {
                question: 'Can I manage multiple brands from one account?',
                answer: 'Absolutely. Workspace isolation lets agencies manage multiple brands with separate accounts, calendars, and analytics, all from one login. Each workspace has its own team members and permissions.',
            },
            {
                question: 'What analytics are available?',
                answer: 'We provide cross-platform performance metrics including engagement rates, reach, impressions, follower growth, and more. Pro and above plans can export analytics as PDF or CSV. Business plans and above can connect Shopify or WooCommerce to track revenue attribution per post.',
            },
            {
                question: 'What is the Reviews & Reputation feature?',
                answer: 'You can monitor and respond to Google Business reviews from a unified inbox. Track sentiment trends over time and protect your brand reputation across multiple locations.',
            },
        ],
    },
    {
        title: 'Billing & Plans',
        items: [
            {
                question: 'Can I upgrade or downgrade at any time?',
                answer: 'Yes. You can change your plan at any time from your billing settings. When upgrading, you get immediate access to the new features. When downgrading, the change takes effect at the end of your current billing cycle.',
            },
            {
                question: 'Is there a free trial for paid plans?',
                answer: 'Yes, all paid plans come with a 14-day free trial so you can explore every feature before committing.',
            },
            {
                question: 'What payment methods do you accept?',
                answer: 'We use Stripe for payment processing and accept all major credit and debit cards (Visa, Mastercard, American Express) as well as some local payment methods depending on your region.',
            },
            {
                question: 'How do I cancel my subscription?',
                answer: 'You can cancel anytime from your billing settings. There are no cancellation fees or long-term contracts. Your access continues until the end of the current billing period.',
            },
        ],
    },
    {
        title: 'Security & Privacy',
        items: [
            {
                question: 'Is my data secure?',
                answer: 'We use industry-standard encryption at rest and in transit. OAuth tokens are stored encrypted and we never store your social media passwords. Our infrastructure is hosted on secure cloud providers with SOC 2 compliance.',
            },
            {
                question: 'Can I request data deletion?',
                answer: 'Yes. You can request complete deletion of your account and all associated data from the Data Deletion page. We process all requests within 30 days in compliance with GDPR and applicable privacy regulations.',
            },
            {
                question: 'Do you sell my data?',
                answer: 'Absolutely not. We never sell, share, or trade your personal data or your social media analytics with third parties. See our Privacy Policy for full details.',
            },
        ],
    },
] as const;

export default function FaqPage() {
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
                    Frequently Asked <span className="text-gradient">Questions</span>
                </h1>
                <p className="mt-4 text-[var(--text-secondary)]">
                    Find answers to common questions about Overseek Socials. Can&apos;t find what you&apos;re looking for?
                    Reach out to our support team.
                </p>

                <div className="mt-12 space-y-12">
                    {FAQ_SECTIONS.map((section) => (
                        <div key={section.title}>
                            <h2 className="mb-5 text-xl font-bold">{section.title}</h2>
                            <div className="space-y-3">
                                {section.items.map((item) => (
                                    <details
                                        key={item.question}
                                        className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden"
                                    >
                                        <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-sm font-semibold transition-colors hover:bg-[var(--bg-tertiary)] [&::-webkit-details-marker]:hidden list-none">
                                            {item.question}
                                            <svg
                                                className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </summary>
                                        <div className="px-6 pb-5">
                                            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                                                {item.answer}
                                            </p>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] py-8">
                <div className="mx-auto max-w-3xl px-6">
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-[var(--text-muted)]">
                        <Link href="/legal/privacy" className="hover:text-[var(--accent-gold)] transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/legal/terms" className="hover:text-[var(--accent-gold)] transition-colors">
                            Terms of Service
                        </Link>
                        <Link href="/legal/data-deletion" className="hover:text-[var(--accent-gold)] transition-colors">
                            Data Deletion
                        </Link>
                    </div>
                    <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                        © {new Date().getFullYear()} Overseek Socials. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
