/**
 * Privacy Policy page
 * Documents data collection, storage, and user rights
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: 'SocialiseIT Privacy Policy - How we collect, use, and protect your data',
};

export default function PrivacyPolicyPage() {
    return (
        <article className="prose prose-neutral dark:prose-invert max-w-none">
            <h1 className="text-gradient">Privacy Policy</h1>
            <p className="text-[var(--text-muted)]">Last updated: February 2026</p>

            <section className="card p-6 my-8">
                <h2 className="mt-0">1. Introduction</h2>
                <p>
                    SocialiseIT (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy.
                    This Privacy Policy explains how we collect, use, disclose, and safeguard
                    your information when you use our social media management platform.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">2. Information We Collect</h2>

                <h3>2.1 Account Information</h3>
                <p>When you create an account, we collect:</p>
                <ul>
                    <li>Email address</li>
                    <li>Name</li>
                    <li>Profile picture (if provided)</li>
                    <li>Password (encrypted)</li>
                </ul>

                <h3>2.2 Connected Social Media Accounts</h3>
                <p>
                    When you connect social media platforms (Instagram, Facebook, TikTok,
                    YouTube, Pinterest), we access and store:
                </p>
                <ul>
                    <li>Account identifiers and access tokens</li>
                    <li>Profile information (name, username, profile picture)</li>
                    <li>Posts and content you create through our platform</li>
                    <li>Analytics data (engagement metrics, follower counts)</li>
                    <li>Comments and messages you choose to manage through our platform</li>
                </ul>

                <h3>2.3 Content and Media</h3>
                <p>We store content you upload, including:</p>
                <ul>
                    <li>Images and videos for social media posts</li>
                    <li>Captions and text content</li>
                    <li>Scheduled post information</li>
                </ul>

                <h3>2.4 Usage Data</h3>
                <p>We automatically collect:</p>
                <ul>
                    <li>Device and browser information</li>
                    <li>IP address</li>
                    <li>Pages visited and actions taken</li>
                    <li>Date and time of access</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">3. How We Use Your Information</h2>
                <p>We use collected information to:</p>
                <ul>
                    <li>Provide and maintain our services</li>
                    <li>Publish content to your connected social media accounts</li>
                    <li>Generate analytics and insights</li>
                    <li>Improve our platform and develop new features</li>
                    <li>Communicate with you about your account</li>
                    <li>Ensure platform security and prevent abuse</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">4. Third-Party Platform Data</h2>
                <p>
                    Our platform integrates with third-party social media services. When you
                    connect these accounts:
                </p>
                <ul>
                    <li>
                        <strong>Meta (Instagram/Facebook):</strong> We access data according
                        to Meta&apos;s Platform Terms and API policies
                    </li>
                    <li>
                        <strong>TikTok:</strong> We access data according to TikTok&apos;s
                        Developer Terms of Service
                    </li>
                    <li>
                        <strong>YouTube:</strong> We access data according to YouTube&apos;s
                        API Services Terms of Service
                    </li>
                    <li>
                        <strong>Pinterest:</strong> We access data according to Pinterest&apos;s
                        Developer Terms
                    </li>
                </ul>
                <p>
                    Each platform has its own privacy policy governing how they handle your data.
                    We encourage you to review their policies.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">5. Data Storage and Security</h2>
                <p>
                    We implement industry-standard security measures to protect your data:
                </p>
                <ul>
                    <li>Encrypted data transmission (TLS/SSL)</li>
                    <li>Encrypted storage for sensitive data</li>
                    <li>Regular security audits</li>
                    <li>Access controls and authentication</li>
                </ul>
                <p>
                    Your data is stored on secure servers. We retain your data as long as
                    your account is active or as needed to provide services.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">6. Your Rights</h2>
                <p>You have the right to:</p>
                <ul>
                    <li>Access your personal data</li>
                    <li>Correct inaccurate data</li>
                    <li>Request deletion of your data</li>
                    <li>Export your data</li>
                    <li>Disconnect social media accounts at any time</li>
                    <li>Object to certain data processing</li>
                </ul>
                <p>
                    To exercise these rights, visit your account settings or contact us directly.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">7. Data Sharing</h2>
                <p>
                    We do not sell your personal information. We may share data with:
                </p>
                <ul>
                    <li>Service providers who assist our operations</li>
                    <li>Legal authorities when required by law</li>
                    <li>Business partners with your consent</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">8. Cookies and Tracking</h2>
                <p>
                    We use cookies and similar technologies for authentication, preferences,
                    and analytics. You can control cookie settings in your browser.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">9. Changes to This Policy</h2>
                <p>
                    We may update this Privacy Policy periodically. We will notify you of
                    significant changes via email or platform notification.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">10. Contact Us</h2>
                <p>
                    If you have questions about this Privacy Policy or your data, contact us at:
                </p>
                <p className="text-[var(--accent-gold)]">
                    privacy@socialiseit.com
                </p>
            </section>
        </article>
    );
}
