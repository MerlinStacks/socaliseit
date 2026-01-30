/**
 * Root layout for the application
 * Sets up providers, fonts, and global styles
 */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'SocialiseIT',
    template: '%s | SocialiseIT',
  },
  description: 'AI-powered social media management platform',
  keywords: ['social media', 'scheduling', 'analytics', 'content management'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAFA' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0F12' },
  ],
};

/**
 * Inline script to initialize theme before React hydration.
 * This prevents flash of wrong theme on page load.
 */
const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('socialiseit-appearance');
    if (saved) {
      var prefs = JSON.parse(saved);
      if (prefs.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
      if (prefs.accentGold) {
        document.documentElement.style.setProperty('--accent-gold', prefs.accentGold);
      }
      if (prefs.accentPink) {
        document.documentElement.style.setProperty('--accent-pink', prefs.accentPink);
      }
    }
  } catch (e) {}
})();
`;

/**
 * Service Worker registration script.
 * Registers SW after page load for progressive enhancement.
 */
const swRegistrationScript = `
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js')
        .then(function(reg) {
          console.log('[App] Service Worker registered, scope:', reg.scope);
        })
        .catch(function(err) {
          console.error('[App] Service Worker registration failed:', err);
        });
    });
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: swRegistrationScript }} />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

