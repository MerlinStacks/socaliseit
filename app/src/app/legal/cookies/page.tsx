/**
 * Cookie Policy page.
 * Why: GDPR compliance requires a clear explanation of
 * cookie usage alongside the privacy policy.
 * Lives inside /legal layout for consistent styling.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Cookie Policy',
    description: 'Overseek Socials Cookie Policy: what cookies we use and why.',
};

export default function CookiePolicyPage() {
    return (
        <article className="prose prose-neutral dark:prose-invert max-w-none">
            <h1 className="text-gradient">Cookie Policy</h1>
            <p className="text-[var(--text-muted)]">Last updated: February 2026</p>

            <section className="card p-6 my-8">
                <h2 className="mt-0">1. What Are Cookies</h2>
                <p>
                    Cookies are small text files stored on your device when you visit a website.
                    They help websites remember your preferences and improve your browsing experience.
                    Overseek Socials uses cookies and similar technologies (such as local storage)
                    to operate and improve our platform.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">2. Essential Cookies</h2>
                <p>
                    These cookies are required for the platform to function and cannot be disabled.
                    They include:
                </p>
                <ul>
                    <li><strong>Session cookies</strong> keep you signed in while you use the platform</li>
                    <li><strong>CSRF tokens</strong> protect against cross-site request forgery attacks</li>
                    <li><strong>Theme preference</strong> remembers your light/dark mode selection</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">3. Functional Cookies</h2>
                <p>
                    These cookies enhance your experience by remembering choices you make:
                </p>
                <ul>
                    <li><strong>Sidebar state</strong> remembers whether the sidebar is expanded or collapsed</li>
                    <li><strong>Calendar view</strong> remembers your preferred calendar view (week/month)</li>
                    <li><strong>Timezone</strong> stores your timezone for accurate scheduling</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">4. Analytics Cookies</h2>
                <p>
                    We may use analytics cookies to understand how visitors interact with our website.
                    This data is aggregated and anonymous, and helps us improve the platform.
                    We do not use third-party advertising cookies or trackers.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">5. Third-Party Cookies</h2>
                <p>
                    When you connect social media accounts (Instagram, Facebook, TikTok, etc.),
                    those platforms may set their own cookies during the OAuth authentication flow.
                    These cookies are governed by the respective platform&apos;s cookie and privacy policies.
                </p>
                <p>
                    Our payment processor, Stripe, may also set cookies during the checkout process.
                    These are governed by{' '}
                    <a
                        href="https://stripe.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-gold)] hover:underline"
                    >
                        Stripe&apos;s Privacy Policy
                    </a>.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">6. Managing Cookies</h2>
                <p>
                    You can control and delete cookies through your browser settings. Note that
                    disabling essential cookies will prevent you from using the platform.
                    Most browsers allow you to:
                </p>
                <ul>
                    <li>View all cookies stored on your device</li>
                    <li>Delete all or specific cookies</li>
                    <li>Block cookies from specific or all websites</li>
                    <li>Set preferences for first-party vs third-party cookies</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">7. Changes to This Policy</h2>
                <p>
                    We may update this Cookie Policy from time to time. Changes will be posted
                    on this page with an updated revision date.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">8. Contact Us</h2>
                <p>
                    If you have questions about our use of cookies, contact us at:
                </p>
                <p className="text-[var(--accent-gold)]">
                    privacy@socialiseit.com
                </p>
            </section>
        </article>
    );
}
