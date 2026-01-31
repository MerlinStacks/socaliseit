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
 * Registers SW, handles updates, and notifies users when refresh is needed.
 * No reinstallation required - just refresh to get updates.
 */
const swRegistrationScript = `
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js')
        .then(function(reg) {
          // Check for updates every 60 seconds
          setInterval(function() { reg.update(); }, 60000);
          
          // Listen for new SW waiting to activate
          reg.addEventListener('updatefound', function() {
            var newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', function() {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available - SW will activate immediately via skipWaiting
                  showUpdateToast();
                }
              });
            }
          });
        })
        .catch(function(err) {
          console.error('[App] Service Worker registration failed:', err);
        });
      
      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'SW_UPDATED') {
          showUpdateToast();
        }
      });
      
      // Refresh-prompting toast (non-blocking)
      function showUpdateToast() {
        if (document.getElementById('sw-update-toast')) return;
        var toast = document.createElement('div');
        toast.id = 'sw-update-toast';
        toast.innerHTML = '<span>New version available</span><button onclick="location.reload()">Refresh</button><button onclick="this.parentElement.remove()">×</button>';
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1a1a2e;color:#fff;padding:12px 16px;border-radius:8px;display:flex;gap:12px;align-items:center;z-index:9999;font-family:system-ui;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.querySelectorAll('button')[0].style.cssText = 'background:#D4A574;color:#000;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:500;';
        toast.querySelectorAll('button')[1].style.cssText = 'background:transparent;color:#888;border:none;padding:4px;cursor:pointer;font-size:18px;';
        document.body.appendChild(toast);
      }
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
        <meta name="mobile-web-app-capable" content="yes" />
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

