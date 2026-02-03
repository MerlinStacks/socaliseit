/**
 * User Data Deletion page
 * Instructions and form for requesting data deletion
 */

'use client';

import { useState } from 'react';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Trash2, CheckCircle, AlertCircle } from 'lucide-react';

export default function DataDeletionPage() {
    const [email, setEmail] = useState('');
    const [reason, setReason] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    /**
     * Handle data deletion request submission
     */
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (!email) {
            setError('Please enter your email address');
            return;
        }

        // In production, this would submit to an API endpoint
        // For now, we'll simulate a successful submission
        setSubmitted(true);
    }

    if (submitted) {
        return (
            <div className="text-center py-12">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success-light)]">
                    <CheckCircle className="h-8 w-8 text-[var(--success)]" />
                </div>
                <h1 className="mt-6 text-2xl font-bold">Request Submitted</h1>
                <p className="mt-4 text-[var(--text-secondary)] max-w-md mx-auto">
                    We have received your data deletion request. You will receive a
                    confirmation email within 24 hours. The deletion process may take
                    up to 30 days to complete.
                </p>
            </div>
        );
    }

    return (
        <article className="max-w-none">
            <h1 className="text-3xl font-bold text-gradient mb-2">User Data Deletion</h1>
            <p className="text-[var(--text-muted)] mb-8">
                Request deletion of your personal data from SocialiseIT
            </p>

            <section className="card p-6 my-8">
                <h2 className="text-xl font-semibold mt-0 mb-4">How Data Deletion Works</h2>
                <div className="space-y-4 text-[var(--text-secondary)]">
                    <p>
                        You have the right to request deletion of your personal data. When you
                        submit a deletion request:
                    </p>
                    <ol className="list-decimal pl-6 space-y-2">
                        <li>We verify your identity through your registered email</li>
                        <li>Your data is scheduled for permanent deletion</li>
                        <li>Deletion is completed within 30 days</li>
                        <li>You receive confirmation when the process is complete</li>
                    </ol>
                </div>
            </section>

            <section className="card p-6 my-8">
                <h2 className="text-xl font-semibold mt-0 mb-4">What Gets Deleted</h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-medium text-[var(--text-primary)] mb-2">
                            Data That Will Be Deleted:
                        </h3>
                        <ul className="space-y-1 text-[var(--text-secondary)]">
                            <li>• Your account information</li>
                            <li>• Profile data and preferences</li>
                            <li>• Uploaded media and content</li>
                            <li>• Scheduled posts and drafts</li>
                            <li>• Connected account tokens</li>
                            <li>• Analytics history</li>
                            <li>• Comments and engagement data</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-medium text-[var(--text-primary)] mb-2">
                            Data We May Retain:
                        </h3>
                        <ul className="space-y-1 text-[var(--text-secondary)]">
                            <li>• Transaction records (for legal compliance)</li>
                            <li>• Anonymized usage statistics</li>
                            <li>• System logs (retained for 90 days)</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="card p-6 my-8">
                <h2 className="text-xl font-semibold mt-0 mb-4">Important Notes</h2>
                <div className="space-y-3 text-[var(--text-secondary)]">
                    <div className="flex gap-3 p-4 rounded-lg bg-[var(--warning-light)]">
                        <AlertCircle className="h-5 w-5 text-[var(--warning)] flex-shrink-0 mt-0.5" />
                        <p className="text-sm">
                            <strong>This action is irreversible.</strong> Once your data is deleted,
                            it cannot be recovered. You will need to create a new account to use
                            SocialiseIT again.
                        </p>
                    </div>
                    <p>
                        Content already published to social media platforms will remain on those
                        platforms. You must delete that content directly through each platform.
                    </p>
                    <p>
                        Disconnecting social media accounts does not delete your data. You must
                        submit a deletion request to remove your data from our systems.
                    </p>
                </div>
            </section>

            <section className="card p-6 my-8">
                <h2 className="text-xl font-semibold mt-0 mb-4 flex items-center gap-2">
                    <Trash2 className="h-5 w-5 text-[var(--error)]" />
                    Request Data Deletion
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-[var(--error-light)] p-3 text-sm text-[var(--error)]">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium mb-1">
                            Email Address <span className="text-[var(--error)]">*</span>
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            placeholder="Enter the email associated with your account"
                        />
                    </div>

                    <div>
                        <label htmlFor="reason" className="block text-sm font-medium mb-1">
                            Reason for Deletion (Optional)
                        </label>
                        <textarea
                            id="reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                            placeholder="Help us improve by sharing why you're deleting your data"
                        />
                    </div>

                    <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--bg-tertiary)]">
                        <input
                            type="checkbox"
                            id="confirm"
                            required
                            className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--accent-gold)] focus:ring-[var(--accent-gold)]"
                        />
                        <label htmlFor="confirm" className="text-sm text-[var(--text-secondary)]">
                            I understand that this action is permanent and my data will be
                            irreversibly deleted within 30 days.
                        </label>
                    </div>

                    <Button type="submit" className="w-full bg-[var(--error)] hover:bg-[var(--error)]/90">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Submit Deletion Request
                    </Button>
                </form>
            </section>

            <section className="card p-6 my-8">
                <h2 className="text-xl font-semibold mt-0 mb-4">Alternative Options</h2>
                <p className="text-[var(--text-secondary)]">
                    Before deleting your account, consider these alternatives:
                </p>
                <ul className="mt-4 space-y-2 text-[var(--text-secondary)]">
                    <li>
                        <strong>Disconnect platforms:</strong> Remove connected social media
                        accounts without deleting your SocialiseIT account
                    </li>
                    <li>
                        <strong>Export your data:</strong> Download a copy of your data
                        before deletion
                    </li>
                    <li>
                        <strong>Contact support:</strong> If you&apos;re having issues, our team
                        may be able to help
                    </li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="text-xl font-semibold mt-0 mb-4">Contact Us</h2>
                <p className="text-[var(--text-secondary)]">
                    For questions about data deletion or assistance with your request:
                </p>
                <p className="mt-2 text-[var(--accent-gold)]">
                    privacy@socialiseit.com
                </p>
            </section>
        </article>
    );
}
