/**
 * Terms of Service page
 * Documents user responsibilities and platform usage guidelines
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: 'SocialiseIT Terms of Service - User agreement and platform guidelines',
};

export default function TermsOfServicePage() {
    return (
        <article className="prose prose-neutral dark:prose-invert max-w-none">
            <h1 className="text-gradient">Terms of Service</h1>
            <p className="text-[var(--text-muted)]">Last updated: February 2026</p>

            <section className="card p-6 my-8">
                <h2 className="mt-0">1. Acceptance of Terms</h2>
                <p>
                    By accessing or using SocialiseIT (&quot;the Service&quot;), you agree to be bound
                    by these Terms of Service. If you do not agree to these terms, please do
                    not use our Service.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">2. Description of Service</h2>
                <p>
                    SocialiseIT is a social media management platform that allows you to:
                </p>
                <ul>
                    <li>Connect and manage multiple social media accounts</li>
                    <li>Create, schedule, and publish content</li>
                    <li>View analytics and engagement metrics</li>
                    <li>Manage comments and messages</li>
                    <li>Create and edit video content</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">3. Account Registration</h2>
                <p>To use our Service, you must:</p>
                <ul>
                    <li>Be at least 18 years old or have parental consent</li>
                    <li>Provide accurate and complete registration information</li>
                    <li>Maintain the security of your account credentials</li>
                    <li>Notify us immediately of any unauthorized access</li>
                </ul>
                <p>
                    You are responsible for all activities that occur under your account.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">4. User Responsibilities</h2>
                <p>You agree to:</p>
                <ul>
                    <li>Use the Service only for lawful purposes</li>
                    <li>Comply with all applicable laws and regulations</li>
                    <li>Respect the terms of service of connected platforms</li>
                    <li>Not post content that infringes intellectual property rights</li>
                    <li>Not engage in spam, harassment, or abusive behavior</li>
                    <li>Not attempt to access unauthorized areas of the Service</li>
                    <li>Not use automated means to access the Service without permission</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">5. Content and Intellectual Property</h2>

                <h3>5.1 Your Content</h3>
                <p>
                    You retain ownership of content you create and upload. By using our Service,
                    you grant us a limited license to store, display, and transmit your content
                    as needed to provide the Service.
                </p>

                <h3>5.2 Our Content</h3>
                <p>
                    The Service, including its design, features, and documentation, is owned
                    by SocialiseIT and protected by intellectual property laws.
                </p>

                <h3>5.3 Third-Party Content</h3>
                <p>
                    Content from connected social media platforms is subject to those
                    platforms&apos; terms and policies.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">6. Third-Party Platforms</h2>
                <p>
                    Our Service integrates with third-party social media platforms. Your use
                    of these integrations is subject to:
                </p>
                <ul>
                    <li>Each platform&apos;s terms of service and community guidelines</li>
                    <li>Platform-specific API usage limits and restrictions</li>
                    <li>Changes to platform APIs that may affect Service functionality</li>
                </ul>
                <p>
                    We are not responsible for actions taken by third-party platforms regarding
                    your accounts or content.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">7. Prohibited Activities</h2>
                <p>You may not:</p>
                <ul>
                    <li>Use the Service to violate any laws</li>
                    <li>Post illegal, harmful, or offensive content</li>
                    <li>Impersonate others or misrepresent your identity</li>
                    <li>Distribute malware or harmful code</li>
                    <li>Attempt to breach security measures</li>
                    <li>Interfere with the Service&apos;s operation</li>
                    <li>Resell or redistribute the Service without authorization</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">8. Service Availability</h2>
                <p>
                    We strive to maintain reliable service but do not guarantee uninterrupted
                    access. We may:
                </p>
                <ul>
                    <li>Perform scheduled maintenance</li>
                    <li>Update or modify features</li>
                    <li>Suspend service for technical issues</li>
                    <li>Discontinue features with reasonable notice</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">9. Termination</h2>
                <p>
                    You may terminate your account at any time through account settings.
                    We may suspend or terminate accounts that violate these terms.
                </p>
                <p>
                    Upon termination, your access to the Service will cease. You may request
                    deletion of your data as described in our Privacy Policy.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">10. Limitation of Liability</h2>
                <p>
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW:
                </p>
                <ul>
                    <li>The Service is provided &quot;as is&quot; without warranties</li>
                    <li>We are not liable for indirect, incidental, or consequential damages</li>
                    <li>Our total liability is limited to fees you paid in the past 12 months</li>
                    <li>We are not responsible for third-party platform actions or outages</li>
                </ul>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">11. Indemnification</h2>
                <p>
                    You agree to indemnify and hold harmless SocialiseIT from claims arising
                    from your use of the Service, your content, or violation of these terms.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">12. Changes to Terms</h2>
                <p>
                    We may update these Terms of Service periodically. Continued use of the
                    Service after changes constitutes acceptance of the new terms.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">13. Governing Law</h2>
                <p>
                    These terms are governed by applicable laws. Any disputes shall be
                    resolved through appropriate legal channels.
                </p>
            </section>

            <section className="card p-6 my-8">
                <h2 className="mt-0">14. Contact Us</h2>
                <p>
                    For questions about these Terms of Service, contact us at:
                </p>
                <p className="text-[var(--accent-gold)]">
                    legal@socialiseit.com
                </p>
            </section>
        </article>
    );
}
