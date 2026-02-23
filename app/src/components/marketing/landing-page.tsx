/**
 * Public landing page shown to unauthenticated visitors.
 * Satisfies Google's requirement for a homepage that explains
 * the app's purpose without requiring login.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────
   DATA
   ────────────────────────────────────────────────────────────── */

/** Feature card data displayed in the features grid */
const FEATURES = [
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9" />
            </svg>
        ),
        title: 'Multi-Platform Publishing',
        description: 'Publish to Instagram, TikTok, YouTube, Facebook, Pinterest, Bluesky, and Google Business from a single unified composer.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
                <path d="M8.56 9.8A4.002 4.002 0 0 1 12 2" />
                <path d="M17.5 21.5l-1-1" />
                <path d="M12 18a6 6 0 0 0 6-6H6a6 6 0 0 0 6 6z" />
                <path d="M2 22l10-10" />
                <path d="M22 2L12 12" />
            </svg>
        ),
        title: 'AI Content Engine',
        description: 'Brand Voice AI, smart caption generation with virality scoring, optimal posting times, and AI-powered comment responses.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
        ),
        title: 'Reviews & Reputation',
        description: 'Monitor and respond to Google reviews from one inbox. Track sentiment trends and protect your brand reputation across locations.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
        ),
        title: 'Content Calendar',
        description: 'Visual week and month views with drag-and-drop scheduling, AI-suggested time slots, and platform colour coding.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
        ),
        title: 'Analytics & ROI',
        description: 'Cross-platform performance metrics with e-commerce attribution. Connect Shopify or WooCommerce to track revenue per post.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
        title: 'Team Collaboration',
        description: 'Role-based access control, activity logging, and workspace isolation for agencies managing multiple brands.',
    },
] as const;

/** Platform icon SVGs for the "Supported Platforms" strip */
const PLATFORM_ICONS = [
    { name: 'Instagram', color: '#E4405F', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
    { name: 'TikTok', color: '#000000', path: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
    { name: 'YouTube', color: '#FF0000', path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
    { name: 'Facebook', color: '#1877F2', path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
    { name: 'Pinterest', color: '#E60023', path: 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z' },
    { name: 'Google Business', color: '#4285F4', path: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' },
] as const;

/** Pricing tiers shown on the landing page */
const PRICING_TIERS = [
    {
        name: 'Free',
        price: '$0',
        period: '/mo',
        description: 'Get started with the basics',
        popular: false,
        cta: 'Get Started',
        features: [
            '3 social accounts',
            '2 team members',
            '30 scheduled posts/month',
            '10 AI generations/month',
            'Content calendar',
            'Basic analytics',
        ],
    },
    {
        name: 'Pro',
        price: '$29',
        period: '/mo',
        description: 'For growing brands',
        popular: true,
        cta: 'Start Free Trial',
        features: [
            '10 social accounts',
            '5 team members',
            '150 scheduled posts/month',
            '100 AI generations/month',
            'Analytics export (PDF/CSV)',
            '3 competitor tracking slots',
        ],
    },
    {
        name: 'Business',
        price: '$79',
        period: '/mo',
        description: 'For teams & agencies',
        popular: false,
        cta: 'Start Free Trial',
        features: [
            '25 social accounts',
            '15 team members',
            '500 scheduled posts/month',
            '500 AI generations/month',
            'Custom branding',
            '10 competitor tracking slots',
        ],
    },
    {
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        description: 'Unlimited everything',
        popular: false,
        cta: 'Contact Us',
        features: [
            'Unlimited social accounts',
            'Unlimited team members',
            'Unlimited scheduled posts',
            'Unlimited AI generations',
            'Priority support',
            'Dedicated account manager',
        ],
    },
] as const;

/** FAQ items shown on the landing page */
const FAQ_ITEMS = [
    {
        question: 'What platforms does Overseek Socials support?',
        answer: 'We currently support Instagram, TikTok, YouTube, Facebook, Pinterest, Bluesky, and Google Business Profile. More platforms are on our roadmap.',
    },
    {
        question: 'Can I try Overseek Socials for free?',
        answer: 'Yes! Our Free plan gives you access to 3 social accounts, 30 scheduled posts per month, and 10 AI-powered content generations. No credit card required.',
    },
    {
        question: 'How does the AI content engine work?',
        answer: 'Our AI learns your brand voice from your existing content and generates on-brand captions, suggests optimal posting times based on your audience, and even scores captions for predicted virality.',
    },
    {
        question: 'Can I manage multiple brands or clients?',
        answer: 'Absolutely. Our workspace isolation feature lets agencies manage multiple brands with separate accounts, calendars, and analytics, all from one login.',
    },
    {
        question: 'Is my data secure?',
        answer: 'We use industry-standard encryption at rest and in transit. OAuth tokens are stored encrypted and we never store your social media passwords. See our Privacy Policy for full details.',
    },
    {
        question: 'Can I cancel or change my plan at any time?',
        answer: 'Yes. You can upgrade, downgrade, or cancel your subscription at any time from your billing settings. No long-term contracts or hidden fees.',
    },
] as const;

/* ──────────────────────────────────────────────────────────────
   FAQ ACCORDION ITEM
   ────────────────────────────────────────────────────────────── */

/** Single collapsible FAQ item with smooth open/close animation */
function FaqItem({ question, answer }: { question: string; answer: string }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="glass-card overflow-hidden rounded-2xl">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold transition-colors hover:bg-[var(--bg-tertiary)]"
            >
                {question}
                <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            <div
                className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
                <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {answer}
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────
   LANDING PAGE
   ────────────────────────────────────────────────────────────── */

/**
 * Public-facing landing page that describes Overseek Socials
 * to satisfy Google's OAuth consent screen requirements.
 */
export function LandingPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            {/* ── Navigation Bar ── */}
            <nav className="sticky top-0 z-30 glass border-b border-[var(--border)]">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-5 w-5"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                            </svg>
                        </div>
                        <span className="text-lg font-bold text-gradient">Overseek Socials</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/about" className="hidden text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors md:block">
                            About
                        </Link>
                        <Link href="#pricing" className="hidden text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors md:block">
                            Pricing
                        </Link>
                        <Link href="/compare" className="hidden text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors md:block">
                            Compare
                        </Link>
                        <Link href="#faq" className="hidden text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors md:block">
                            FAQ
                        </Link>
                        <Link href="/login">
                            <Button variant="secondary" className="btn-interactive rounded-full">
                                Sign In
                            </Button>
                        </Link>
                        <Link href="/register">
                            <Button className="btn-interactive rounded-full">
                                Get Started
                            </Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero Section ── */}
            <section className="relative overflow-hidden px-6 pb-20 pt-24 md:pt-32">
                {/* Decorative gradient blobs */}
                <div
                    className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2"
                    style={{
                        width: 600,
                        height: 600,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, var(--accent-gold) 0%, transparent 70%)',
                        opacity: 0.08,
                    }}
                />
                <div
                    className="pointer-events-none absolute -top-20 right-0"
                    style={{
                        width: 400,
                        height: 400,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, var(--accent-pink) 0%, transparent 70%)',
                        opacity: 0.06,
                    }}
                />

                <div className="relative mx-auto max-w-4xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-2 text-xs font-medium text-[var(--text-secondary)]">
                        <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
                        AI-Powered &middot; Multi-Platform &middot; Built for Teams
                    </div>

                    <h1
                        className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl"
                        style={{ animationDelay: '0.1s' }}
                    >
                        <span className="text-gradient">AI-Powered</span>{' '}
                        Social Media Management
                    </h1>

                    <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
                        Overseek Socials is the all-in-one platform for agencies and brands who want full
                        control over their social media operations. Schedule posts, track
                        analytics, and manage engagement, all from one place, powered by AI.
                    </p>

                    <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                        <Link href="/register">
                            <Button className="btn-interactive h-12 rounded-full px-8 text-base">
                                Get Started Free
                            </Button>
                        </Link>
                        <Link href="#pricing">
                            <Button variant="secondary" className="btn-interactive h-12 rounded-full px-8 text-base">
                                View Pricing
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Supported Platforms Strip ── */}
            <section className="border-y border-[var(--border)] bg-[var(--bg-secondary)] py-10">
                <div className="mx-auto max-w-5xl px-6 text-center">
                    <p className="mb-8 text-sm font-medium uppercase tracking-widest text-[var(--text-muted)]">
                        Publish Everywhere
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
                        {PLATFORM_ICONS.map((platform) => (
                            <div
                                key={platform.name}
                                className="group flex flex-col items-center gap-2 transition-transform duration-200 hover:scale-110"
                                title={platform.name}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-7 w-7 transition-colors duration-200"
                                    style={{ fill: 'var(--text-muted)' }}
                                    onMouseEnter={(e) => { (e.currentTarget as SVGSVGElement).style.fill = platform.color; }}
                                    onMouseLeave={(e) => { (e.currentTarget as SVGSVGElement).style.fill = 'var(--text-muted)'; }}
                                >
                                    <path d={platform.path} />
                                </svg>
                                <span className="text-[11px] text-[var(--text-muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                    {platform.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features Grid ── */}
            <section className="px-6 py-20 md:py-28">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-14 text-center">
                        <h2 className="text-3xl font-bold md:text-4xl">
                            Everything You Need to{' '}
                            <span className="text-gradient">Dominate Social</span>
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)]">
                            A powerful all-in-one alternative to Hootsuite, Buffer, and
                            VistaSocial, with AI built into every workflow.
                        </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((feature) => (
                            <div
                                key={feature.title}
                                className="glass-card card-hover rounded-2xl p-7"
                            >
                                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient text-white">
                                    {feature.icon}
                                </div>
                                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Pricing Section ── */}
            <section id="pricing" className="scroll-mt-20 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-20 md:py-28">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-14 text-center">
                        <h2 className="text-3xl font-bold md:text-4xl">
                            Simple, <span className="text-gradient">Transparent</span> Pricing
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)]">
                            Start free, upgrade when you&apos;re ready. No hidden fees, cancel anytime.
                        </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {PRICING_TIERS.map((tier) => (
                            <div
                                key={tier.name}
                                className={`relative flex flex-col rounded-3xl border p-7 transition-all duration-200 hover:shadow-lg ${tier.popular
                                    ? 'border-[var(--accent-gold)] bg-gradient-to-b from-[var(--accent-gold-light)] to-[var(--bg-secondary)] shadow-md'
                                    : 'border-[var(--border)] bg-[var(--bg-secondary)]'
                                    }`}
                            >
                                {tier.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient px-4 py-1 text-xs font-semibold text-white">
                                        Most Popular
                                    </div>
                                )}
                                <div className="mb-6">
                                    <h3 className="text-lg font-bold">{tier.name}</h3>
                                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{tier.description}</p>
                                    <div className="mt-4 flex items-baseline gap-1">
                                        <span className="text-4xl font-extrabold tracking-tight">{tier.price}</span>
                                        {tier.period && (
                                            <span className="text-sm text-[var(--text-muted)]">{tier.period}</span>
                                        )}
                                    </div>
                                </div>
                                <ul className="mb-8 flex-1 space-y-3">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2.5 text-sm">
                                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            <span className="text-[var(--text-secondary)]">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/register" className="mt-auto">
                                    <Button
                                        className="btn-interactive w-full rounded-full"
                                        variant={tier.popular ? 'primary' : 'secondary'}
                                    >
                                        {tier.cta}
                                    </Button>
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FAQ Section ── */}
            <section id="faq" className="scroll-mt-20 px-6 py-20 md:py-28">
                <div className="mx-auto max-w-3xl">
                    <div className="mb-14 text-center">
                        <h2 className="text-3xl font-bold md:text-4xl">
                            Frequently Asked <span className="text-gradient">Questions</span>
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)]">
                            Everything you need to know about Overseek Socials.
                        </p>
                    </div>
                    <div className="space-y-3">
                        {FAQ_ITEMS.map((item) => (
                            <FaqItem
                                key={item.question}
                                question={item.question}
                                answer={item.answer}
                            />
                        ))}
                    </div>
                    <div className="mt-10 text-center">
                        <p className="text-sm text-[var(--text-secondary)]">
                            Still have questions?{' '}
                            <Link href="/faq" className="font-medium text-[var(--accent-gold)] hover:underline">
                                View all FAQs
                            </Link>
                        </p>
                    </div>
                </div>
            </section>

            {/* ── CTA Section ── */}
            <section className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-bold">
                        Ready to Take Control?
                    </h2>
                    <p className="mt-4 text-[var(--text-secondary)]">
                        Join growing teams and agencies already using Overseek Socials
                        to manage their social media operations.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link href="/register">
                            <Button className="btn-interactive h-12 rounded-full px-8 text-base">
                                Create Your Account
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="border-t border-[var(--border)] py-8">
                <div className="mx-auto max-w-6xl px-6">
                    <div className="flex flex-wrap justify-center gap-6 text-sm text-[var(--text-muted)]">
                        <Link href="/about" className="hover:text-[var(--accent-gold)] transition-colors">
                            About
                        </Link>
                        <Link href="/contact" className="hover:text-[var(--accent-gold)] transition-colors">
                            Contact
                        </Link>
                        <Link href="/changelog" className="hover:text-[var(--accent-gold)] transition-colors">
                            Changelog
                        </Link>
                        <Link href="/compare" className="hover:text-[var(--accent-gold)] transition-colors">
                            Compare
                        </Link>
                        <Link href="/faq" className="hover:text-[var(--accent-gold)] transition-colors">
                            FAQ
                        </Link>
                        <Link href="/status-public" className="hover:text-[var(--accent-gold)] transition-colors">
                            Status
                        </Link>
                        <Link href="/legal/privacy" className="hover:text-[var(--accent-gold)] transition-colors">
                            Privacy
                        </Link>
                        <Link href="/legal/terms" className="hover:text-[var(--accent-gold)] transition-colors">
                            Terms
                        </Link>
                        <Link href="/legal/cookies" className="hover:text-[var(--accent-gold)] transition-colors">
                            Cookies
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
