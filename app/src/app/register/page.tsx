/**
 * Registration page for new users
 * Why: Split layout on desktop — branded hero (left) + form (right).
 * Mobile collapses to a single-column form.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, BarChart3, MessageSquare } from 'lucide-react';

export default function RegisterPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Handle registration form submission
     */
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        // Validate passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        // Validate password length
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to create account');
                return;
            }

            // Redirect to login on success
            router.push('/login?registered=true');
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen bg-[var(--bg-primary)]">
            {/* Hero Panel — desktop only */}
            <div className="relative hidden w-1/2 overflow-hidden md:flex md:flex-col md:items-center md:justify-center bg-gradient">
                {/* Decorative floating shapes */}
                <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute top-1/4 right-10 h-24 w-24 rounded-2xl bg-white/5 rotate-12 animate-pulse" />
                <div className="absolute bottom-1/3 left-16 h-16 w-16 rounded-full bg-white/5 animate-pulse" style={{ animationDelay: '1s' }} />

                {/* Content */}
                <div className="relative z-10 max-w-md px-10 text-center text-white">
                    <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-10 w-10"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" />
                            <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                    </div>
                    <h2 className="mb-4 text-3xl font-bold">Join Overseek Socials</h2>
                    <p className="mb-10 text-lg text-white/80">
                        Start managing your social presence with AI-powered tools.
                    </p>

                    {/* Feature highlights */}
                    <div className="space-y-4 text-left">
                        <FeatureItem
                            icon={<Calendar className="h-5 w-5" />}
                            title="Schedule & Automate"
                            description="Plan your content calendar across every platform"
                        />
                        <FeatureItem
                            icon={<MessageSquare className="h-5 w-5" />}
                            title="Unified Engagement"
                            description="Reply to comments, DMs and reviews in one inbox"
                        />
                        <FeatureItem
                            icon={<BarChart3 className="h-5 w-5" />}
                            title="Actionable Analytics"
                            description="Understand what works with real-time insights"
                        />
                    </div>
                </div>
            </div>

            {/* Form Panel */}
            <div className="flex w-full items-center justify-center p-8 md:w-1/2">
                <div className="w-full max-w-md space-y-8">
                    {/* Logo — mobile only */}
                    <div className="text-center md:hidden">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-7 w-7"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                            </svg>
                        </div>
                        <h1 className="mt-4 text-2xl font-bold text-gradient">Overseek Socials</h1>
                        <p className="mt-2 text-[var(--text-secondary)]">
                            Create your account
                        </p>
                    </div>

                    {/* Desktop heading */}
                    <div className="hidden md:block">
                        <h1 className="text-2xl font-bold">Create your account</h1>
                        <p className="mt-1 text-[var(--text-secondary)]">
                            Get started for free — no credit card required
                        </p>
                    </div>

                    {/* Registration Card */}
                    <div className="card p-6">
                        <h2 className="mb-6 text-center text-lg font-semibold md:hidden">Get started for free</h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="rounded-lg bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label htmlFor="name" className="block text-sm font-medium mb-1">
                                    Full name
                                </label>
                                <Input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="h-11 px-4"
                                    placeholder="John Doe"
                                />
                            </div>

                            <div>
                                <label htmlFor="email" className="block text-sm font-medium mb-1">
                                    Email
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-11 px-4"
                                    placeholder="you@example.com"
                                />
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium mb-1">
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="h-11 px-4"
                                    placeholder="••••••••"
                                />
                                <p className="mt-1 text-xs text-[var(--text-muted)]">
                                    Must be at least 8 characters
                                </p>
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
                                    Confirm password
                                </label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="h-11 px-4"
                                    placeholder="••••••••"
                                />
                            </div>

                            <Button type="submit" className="w-full" isLoading={isLoading}>
                                Create account
                            </Button>
                        </form>

                        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
                            Already have an account?{' '}
                            <Link href="/login" className="text-[var(--accent)] hover:underline">
                                Sign in
                            </Link>
                        </p>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs text-[var(--text-muted)]">
                        By creating an account, you agree to our{' '}
                        <Link href="/legal/terms" className="text-[var(--accent-gold)] hover:underline">
                            Terms of Service
                        </Link>
                        {' '}and{' '}
                        <Link href="/legal/privacy" className="text-[var(--accent-gold)] hover:underline">
                            Privacy Policy
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * Feature highlight row for the hero panel
 */
function FeatureItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                {icon}
            </div>
            <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-white/70">{description}</p>
            </div>
        </div>
    );
}
