/**
 * App-Level 404 Page
 * Why: Without this, invalid URLs show the raw Next.js default 404 with no
 * branding or navigation. This provides a polished recovery experience.
 */

import Link from 'next/link';
import { Search, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--bg-primary)]">
            <div className="max-w-md w-full text-center animate-fade-in">
                {/* 404 Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-[var(--accent-gold-light)] flex items-center justify-center">
                        <Search className="w-10 h-10 text-[var(--accent-gold)]" />
                    </div>
                </div>

                <h1 className="text-4xl font-bold text-gradient mb-2">404</h1>
                <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    Page not found
                </h2>
                <p className="text-[var(--text-secondary)] mb-8">
                    The page you&apos;re looking for doesn&apos;t exist or may have been moved.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient text-white font-medium btn-interactive"
                    >
                        <Home className="w-4 h-4" />
                        Go to Dashboard
                    </Link>
                    <button
                        onClick={() => typeof window !== 'undefined' && window.history.back()}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
}
