/**
 * Platform developer portal links and redirect URI templates
 * Used by the setup wizard to help users configure OAuth credentials
 */

export interface PlatformSetupInfo {
    platform: string;
    name: string;
    icon: string;
    devPortalUrl: string;
    devPortalLabel: string;
    redirectUriPath: string;
    setupHints: string[];
}

/**
 * Returns platform setup info with redirect URIs computed from the current app URL.
 */
export function getPlatformSetupInfo(appUrl: string): PlatformSetupInfo[] {
    // Strip trailing slash
    const base = appUrl.replace(/\/$/, '');

    return [
        {
            platform: 'meta',
            name: 'Meta (Instagram/Facebook)',
            icon: '📸',
            devPortalUrl: 'https://developers.facebook.com/apps/',
            devPortalLabel: 'Meta Developer Portal',
            redirectUriPath: `${base}/api/accounts/connect/instagram/callback`,
            setupHints: [
                'Create a new app → select "Business" type',
                'Add "Instagram Basic Display" and "Facebook Login" products',
                'Copy App ID and App Secret to the credential form',
            ],
        },
        {
            platform: 'tiktok',
            name: 'TikTok',
            icon: '🎵',
            devPortalUrl: 'https://developers.tiktok.com/apps/',
            devPortalLabel: 'TikTok Developer Portal',
            redirectUriPath: `${base}/api/accounts/connect/tiktok/callback`,
            setupHints: [
                'Create a new app in the TikTok Developer Portal',
                'Add "Login Kit" and "Content Posting API" products',
                'Copy Client Key and Client Secret',
            ],
        },
        {
            platform: 'youtube',
            name: 'YouTube',
            icon: '📺',
            devPortalUrl: 'https://console.cloud.google.com/apis/credentials',
            devPortalLabel: 'Google Cloud Console',
            redirectUriPath: `${base}/api/accounts/connect/youtube/callback`,
            setupHints: [
                'Create OAuth 2.0 credentials in Google Cloud Console',
                'Enable YouTube Data API v3',
                'Set application type to "Web application"',
            ],
        },
        {
            platform: 'pinterest',
            name: 'Pinterest',
            icon: '📌',
            devPortalUrl: 'https://developers.pinterest.com/apps/',
            devPortalLabel: 'Pinterest Developer Portal',
            redirectUriPath: `${base}/api/accounts/connect/pinterest/callback`,
            setupHints: [
                'Create a new app in Pinterest Developer Portal',
                'Request access to the Content Publishing API',
                'Copy App ID and App Secret',
            ],
        },
        {
            platform: 'linkedin',
            name: 'LinkedIn',
            icon: '💼',
            devPortalUrl: 'https://www.linkedin.com/developers/apps',
            devPortalLabel: 'LinkedIn Developer Portal',
            redirectUriPath: `${base}/api/accounts/connect/linkedin/callback`,
            setupHints: [
                'Create a new app in LinkedIn Developer Portal',
                'Request "Share on LinkedIn" and "Sign In with LinkedIn" products',
                'Copy Client ID and Client Secret from the Auth tab',
            ],
        },
    ];
}
