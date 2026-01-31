/**
 * UTM Link Management Service
 * Auto-generate and track UTM parameters for posts
 */

import { logger } from './logger';

export interface UTMParams {
    source: string;
    medium: string;
    campaign: string;
    term?: string;
    content?: string;
}

export interface TrackedLink {
    id: string;
    workspaceId: string;
    originalUrl: string;
    shortUrl: string;
    utmParams: UTMParams;
    postId?: string;
    platform?: string;
    clicks: number;
    conversions: number;
    revenue: number;
    createdAt: Date;
}

export interface LinkAnalytics {
    totalClicks: number;
    uniqueClicks: number;
    conversions: number;
    conversionRate: number;
    revenue: number;
    clicksByDay: { date: string; clicks: number }[];
    topReferrers: { referrer: string; clicks: number }[];
}

/**
 * Default UTM templates by platform
 */
export const UTM_TEMPLATES: Record<string, Partial<UTMParams>> = {
    instagram: {
        source: 'instagram',
        medium: 'social',
    },
    tiktok: {
        source: 'tiktok',
        medium: 'social',
    },
    youtube: {
        source: 'youtube',
        medium: 'video',
    },
    facebook: {
        source: 'facebook',
        medium: 'social',
    },
    pinterest: {
        source: 'pinterest',
        medium: 'social',
    },
};

/**
 * Generate UTM parameters for a post
 */
export function generateUTMParams(
    platform: string,
    campaign: string,
    options?: { term?: string; content?: string }
): UTMParams {
    const template = UTM_TEMPLATES[platform] || { source: platform, medium: 'social' };

    return {
        source: template.source || platform,
        medium: template.medium || 'social',
        campaign: slugify(campaign),
        term: options?.term,
        content: options?.content,
    };
}

/**
 * Build full URL with UTM parameters
 */
export function buildTrackedUrl(baseUrl: string, utmParams: UTMParams): string {
    const url = new URL(baseUrl);

    url.searchParams.set('utm_source', utmParams.source);
    url.searchParams.set('utm_medium', utmParams.medium);
    url.searchParams.set('utm_campaign', utmParams.campaign);

    if (utmParams.term) {
        url.searchParams.set('utm_term', utmParams.term);
    }
    if (utmParams.content) {
        url.searchParams.set('utm_content', utmParams.content);
    }

    return url.toString();
}

/**
 * Generate short URL (mock implementation)
 */
export async function createShortUrl(
    workspaceId: string,
    originalUrl: string,
    utmParams: UTMParams
): Promise<TrackedLink> {
    const fullUrl = buildTrackedUrl(originalUrl, utmParams);
    const shortCode = generateShortCode();

    // In production, save to database
    const trackedLink: TrackedLink = {
        id: `link_${Date.now()}`,
        workspaceId,
        originalUrl,
        shortUrl: `https://soc.it/${shortCode}`,
        utmParams,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        createdAt: new Date(),
    };

    return trackedLink;
}

/**
 * Track link click
 */
export async function trackClick(
    linkId: string,
    metadata: {
        userAgent?: string;
        referrer?: string;
        ip?: string;
        country?: string;
    }
): Promise<void> {
    // TODO: In production:
    // 1. Increment click count
    // 2. Store click metadata for analytics
    // 3. Check for conversion (via pixel or webhook)
    logger.debug({ linkId, ...metadata }, 'Tracked link click');
}

/**
 * Track conversion
 */
export async function trackConversion(
    linkId: string,
    data: {
        orderId: string;
        revenue: number;
        currency: string;
    }
): Promise<void> {
    // TODO: In production:
    // 1. Match conversion to link
    // 2. Update link stats
    // 3. Update post attribution
    logger.debug({ linkId, ...data }, 'Tracked conversion');
}

/**
 * Get link analytics
 */
export async function getLinkAnalytics(linkId: string): Promise<LinkAnalytics> {
    // Mock data
    return {
        totalClicks: 1247,
        uniqueClicks: 892,
        conversions: 34,
        conversionRate: 3.8,
        revenue: 2890.50,
        clicksByDay: [
            { date: '2024-01-20', clicks: 145 },
            { date: '2024-01-21', clicks: 234 },
            { date: '2024-01-22', clicks: 312 },
            { date: '2024-01-23', clicks: 198 },
            { date: '2024-01-24', clicks: 178 },
            { date: '2024-01-25', clicks: 180 },
        ],
        topReferrers: [
            { referrer: 'instagram.com', clicks: 456 },
            { referrer: 'tiktok.com', clicks: 234 },
            { referrer: 'direct', clicks: 201 },
        ],
    };
}

/**
 * Auto-replace links in caption with tracked versions
 */
export async function processLinksInCaption(
    workspaceId: string,
    caption: string,
    platform: string,
    campaign: string
): Promise<{ caption: string; links: TrackedLink[] }> {
    // Find URLs in caption
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = caption.match(urlRegex) || [];
    const links: TrackedLink[] = [];

    let processedCaption = caption;

    for (const url of urls) {
        const utmParams = generateUTMParams(platform, campaign);
        const trackedLink = await createShortUrl(workspaceId, url, utmParams);
        links.push(trackedLink);

        // Replace original URL with short URL
        processedCaption = processedCaption.replace(url, trackedLink.shortUrl);
    }

    return { caption: processedCaption, links };
}

// Utility functions

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
