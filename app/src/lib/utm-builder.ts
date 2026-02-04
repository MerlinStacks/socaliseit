/**
 * UTM Builder Service
 * Utilities for generating and managing UTM tracking parameters.
 *
 * Why: Enables campaign tracking by auto-appending UTM parameters
 * to shared links, with template support for consistency.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface UtmParams {
    source: string;
    medium: string;
    campaign?: string;
    content?: string;
    term?: string;
}

export interface UtmTemplate {
    id: string;
    name: string;
    source: string;
    medium: string;
    campaign?: string;
    content?: string;
    term?: string;
    usageCount: number;
}

// ============================================================================
// UTM GENERATION
// ============================================================================

/**
 * Build a URL with UTM parameters appended.
 */
export function buildUtmUrl(baseUrl: string, params: UtmParams): string {
    try {
        const url = new URL(baseUrl);

        // Required params
        url.searchParams.set('utm_source', params.source);
        url.searchParams.set('utm_medium', params.medium);

        // Optional params
        if (params.campaign) {
            url.searchParams.set('utm_campaign', params.campaign);
        }
        if (params.content) {
            url.searchParams.set('utm_content', params.content);
        }
        if (params.term) {
            url.searchParams.set('utm_term', params.term);
        }

        return url.toString();
    } catch {
        // If URL parsing fails, append query string manually
        const queryParts = [`utm_source=${encodeURIComponent(params.source)}`, `utm_medium=${encodeURIComponent(params.medium)}`];

        if (params.campaign) {
            queryParts.push(`utm_campaign=${encodeURIComponent(params.campaign)}`);
        }
        if (params.content) {
            queryParts.push(`utm_content=${encodeURIComponent(params.content)}`);
        }
        if (params.term) {
            queryParts.push(`utm_term=${encodeURIComponent(params.term)}`);
        }

        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}${queryParts.join('&')}`;
    }
}

/**
 * Extract UTM parameters from a URL.
 */
export function parseUtmFromUrl(url: string): UtmParams | null {
    try {
        const parsed = new URL(url);
        const source = parsed.searchParams.get('utm_source');
        const medium = parsed.searchParams.get('utm_medium');

        if (!source || !medium) {
            return null;
        }

        return {
            source,
            medium,
            campaign: parsed.searchParams.get('utm_campaign') ?? undefined,
            content: parsed.searchParams.get('utm_content') ?? undefined,
            term: parsed.searchParams.get('utm_term') ?? undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Generate UTM params from platform context.
 */
export function generatePlatformUtm(
    platform: string,
    campaignName?: string,
    contentLabel?: string
): UtmParams {
    return {
        source: platform.toLowerCase(),
        medium: 'social',
        campaign: campaignName,
        content: contentLabel,
    };
}

// ============================================================================
// UTM TEMPLATES (Database Operations)
// ============================================================================

/**
 * Get all UTM templates for a organization.
 */
export async function getUtmTemplates(organizationId: string): Promise<UtmTemplate[]> {
    const templates = await db.utmTemplate.findMany({
        where: { organizationId },
        orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    });

    return templates.map((t) => ({
        id: t.id,
        name: t.name,
        source: t.source,
        medium: t.medium,
        campaign: t.campaign ?? undefined,
        content: t.content ?? undefined,
        term: t.term ?? undefined,
        usageCount: t.usageCount,
    }));
}

/**
 * Create a new UTM template.
 */
export async function createUtmTemplate(
    organizationId: string,
    name: string,
    params: UtmParams
): Promise<UtmTemplate> {
    const template = await db.utmTemplate.create({
        data: {
            organizationId,
            name,
            source: params.source,
            medium: params.medium,
            campaign: params.campaign,
            content: params.content,
            term: params.term,
        },
    });

    logger.info({ templateId: template.id, organizationId }, 'Created UTM template');

    return {
        id: template.id,
        name: template.name,
        source: template.source,
        medium: template.medium,
        campaign: template.campaign ?? undefined,
        content: template.content ?? undefined,
        term: template.term ?? undefined,
        usageCount: 0,
    };
}

/**
 * Update an existing UTM template.
 */
export async function updateUtmTemplate(
    templateId: string,
    updates: Partial<UtmParams> & { name?: string }
): Promise<UtmTemplate> {
    const template = await db.utmTemplate.update({
        where: { id: templateId },
        data: {
            name: updates.name,
            source: updates.source,
            medium: updates.medium,
            campaign: updates.campaign,
            content: updates.content,
            term: updates.term,
        },
    });

    return {
        id: template.id,
        name: template.name,
        source: template.source,
        medium: template.medium,
        campaign: template.campaign ?? undefined,
        content: template.content ?? undefined,
        term: template.term ?? undefined,
        usageCount: template.usageCount,
    };
}

/**
 * Delete a UTM template.
 */
export async function deleteUtmTemplate(templateId: string): Promise<void> {
    await db.utmTemplate.delete({
        where: { id: templateId },
    });

    logger.info({ templateId }, 'Deleted UTM template');
}

/**
 * Record usage of a UTM template.
 */
export async function recordUtmUsage(templateId: string): Promise<void> {
    await db.utmTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
    });
}

// ============================================================================
// LINK DETECTION & REPLACEMENT
// ============================================================================

/**
 * Find all URLs in a caption.
 */
export function extractUrlsFromCaption(caption: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const matches = caption.match(urlRegex);
    return matches ?? [];
}

/**
 * Replace URLs in caption with UTM-tagged versions.
 */
export function applyUtmToCaption(caption: string, params: UtmParams): string {
    const urls = extractUrlsFromCaption(caption);

    let result = caption;
    urls.forEach((url) => {
        // Skip if URL already has UTM params
        if (url.includes('utm_source')) {
            return;
        }

        const taggedUrl = buildUtmUrl(url, params);
        result = result.replace(url, taggedUrl);
    });

    return result;
}

// ============================================================================
// DEFAULT TEMPLATES
// ============================================================================

export const DEFAULT_UTM_TEMPLATES: Array<
    Omit<UtmTemplate, 'id' | 'usageCount'>
> = [
        {
            name: 'Instagram Post',
            source: 'instagram',
            medium: 'social',
            content: 'feed_post',
        },
        {
            name: 'Instagram Story',
            source: 'instagram',
            medium: 'social',
            content: 'story',
        },
        {
            name: 'Facebook Post',
            source: 'facebook',
            medium: 'social',
            content: 'feed_post',
        },
        {
            name: 'Twitter/X Post',
            source: 'twitter',
            medium: 'social',
            content: 'tweet',
        },
        {
            name: 'LinkedIn Post',
            source: 'linkedin',
            medium: 'social',
            content: 'feed_post',
        },
        {
            name: 'TikTok Bio',
            source: 'tiktok',
            medium: 'social',
            content: 'bio_link',
        },
        {
            name: 'YouTube Description',
            source: 'youtube',
            medium: 'social',
            content: 'description',
        },
        {
            name: 'Email Newsletter',
            source: 'newsletter',
            medium: 'email',
            content: 'main_cta',
        },
    ];

/**
 * Initialize default UTM templates for a new organization.
 */
export async function initializeDefaultTemplates(
    organizationId: string
): Promise<void> {
    const existing = await db.utmTemplate.count({
        where: { organizationId },
    });

    if (existing > 0) {
        return; // Already has templates
    }

    await db.utmTemplate.createMany({
        data: DEFAULT_UTM_TEMPLATES.map((t) => ({
            organizationId,
            name: t.name,
            source: t.source,
            medium: t.medium,
            campaign: t.campaign ?? null,
            content: t.content ?? null,
            term: t.term ?? null,
        })),
    });

    logger.info({ organizationId }, 'Initialized default UTM templates');
}
