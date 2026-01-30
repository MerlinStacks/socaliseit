/**
 * Login page with OAuth and email/password authentication
 */

'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Handle email/password form submission
     */
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError('Invalid email or password');
            } else {
                window.location.href = '/dashboard';
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    /**
     * Handle Google OAuth sign in
     */
    async function handleGoogleSignIn() {
        await signIn('google', { callbackUrl: '/dashboard' });
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
            <div className="w-full max-w-md space-y-8 p-8">
                {/* Logo */}
                <div className="text-center">
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
                    <h1 className="mt-4 text-2xl font-bold text-gradient">SocialiseIT</h1>
                    <p className="mt-2 text-[var(--text-secondary)]">
                        AI-powered social media management
                    </p>
                </div>

                {/* Login Card */}
                <div className="card p-6">
                    <h2 className="mb-6 text-center text-lg font-semibold">Sign in to your account</h2>

                    {/* Google OAuth */}
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={handleGoogleSignIn}
                    >
                        <GoogleIcon />
                        Continue with Google
                    </Button>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-[var(--border)]" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-[var(--bg-secondary)] px-2 text-[var(--text-muted)]">
                                or continue with email
                            </span>
                        </div>
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="rounded-lg bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
                                {error}
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium mb-1">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium mb-1">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                placeholder="••••••••"
                            />
                        </div>

                        <Button type="submit" className="w-full" isLoading={isLoading}>
                            Sign in
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="text-[var(--accent)] hover:underline">
                            Create one
                        </Link>
                    </p>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-[var(--text-muted)]">
                    By continuing, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}
