/**
 * Layout for legal pages
 * Provides consistent styling and navigation for legal content
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="sticky top-0 z-10 glass border-b border-[var(--border)]">
                <div className="mx-auto max-w-3xl px-6 py-4">
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Login
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="mx-auto max-w-3xl px-6 py-12">
                {children}
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
                        © {new Date().getFullYear()} SocialiseIT. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
