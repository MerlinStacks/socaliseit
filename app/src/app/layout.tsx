/**
 * Root layout for the application
 * Sets up providers, fonts, and global styles
 */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ImpersonationBanner } from '@/components/admin/impersonation-banner';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Overseek Socials',
    template: '%s | Overseek Socials',
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
  } catch (e) { console.warn('[Theme] Failed to load preferences:', e); }
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Overseek" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* iOS Splash Screens - prevents white flash on PWA launch */}
        {/* iPhone 15 Pro Max, 15 Plus, 14 Pro Max */}
        <link rel="apple-touch-startup-image" href="/splash/1290x2796.svg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 15 Pro, 15, 14 Pro */}
        <link rel="apple-touch-startup-image" href="/splash/1179x2556.svg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 14, 13, 12 Pro Max */}
        <link rel="apple-touch-startup-image" href="/splash/1284x2778.svg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 14, 13, 12, 13 Pro, 12 Pro */}
        <link rel="apple-touch-startup-image" href="/splash/1170x2532.svg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 13 mini, 12 mini */}
        <link rel="apple-touch-startup-image" href="/splash/1125x2436.svg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 11 Pro Max, XS Max */}
        <link rel="apple-touch-startup-image" href="/splash/1242x2688.svg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 11, XR */}
        <link rel="apple-touch-startup-image" href="/splash/828x1792.svg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPhone SE 3rd gen, 8, 7, 6s */}
        <link rel="apple-touch-startup-image" href="/splash/750x1334.svg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad Pro 12.9" */}
        <link rel="apple-touch-startup-image" href="/splash/2048x2732.svg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad Pro 11" */}
        <link rel="apple-touch-startup-image" href="/splash/1668x2388.svg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad Air, iPad 10th gen */}
        <link rel="apple-touch-startup-image" href="/splash/1640x2360.svg" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad mini */}
        <link rel="apple-touch-startup-image" href="/splash/1488x2266.svg" media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)" />

        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: swRegistrationScript }} />
      </head>
      <body className={inter.className}>
        {/* PWA Cold-Start Splash Screen — inline CSS renders before JS loads */}
        <div
          id="pwa-splash"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-primary, #FDFBF7)',
            transition: 'opacity 0.4s ease-out',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            {/* Brand logo mark */}
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              fill="none"
              style={{ margin: '0 auto 16px', animation: 'splash-pulse 1.5s ease-in-out infinite' }}
            >
              <rect width="64" height="64" rx="16" fill="url(#splash-grad)" />
              <path
                d="M20 32c0-6.627 5.373-12 12-12s12 5.373 12 12-5.373 12-12 12"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="32" cy="32" r="4" fill="white" />
            </svg>
            <p
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-muted, #999)',
                letterSpacing: '0.05em',
              }}
            >
              OVERSEEK
            </p>
          </div>
          <style dangerouslySetInnerHTML={{
            __html: `
            @keyframes splash-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.05); opacity: 0.85; }
            }
          `}} />
          <svg width="0" height="0">
            <defs>
              <linearGradient id="splash-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D4A574" />
                <stop offset="1" stopColor="#E8917E" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <script dangerouslySetInnerHTML={{
          __html: `
          (function() {
            var splash = document.getElementById('pwa-splash');
            if (!splash) return;
            // Hide after first paint + small delay for smooth transition
            function hideSplash() {
              splash.style.opacity = '0';
              splash.style.pointerEvents = 'none';
              setTimeout(function() { splash.remove(); }, 400);
            }
            // Hide when app content is ready, or after max 3s timeout
            if (document.readyState === 'complete') { hideSplash(); }
            else { window.addEventListener('load', hideSplash); }
            setTimeout(hideSplash, 3000);
          })();
        `}} />

        <Providers>
          <ImpersonationBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}

