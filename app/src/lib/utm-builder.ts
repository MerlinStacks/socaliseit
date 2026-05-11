/**
 * UTM Builder Service
 * Utilities for generating and managing UTM tracking parameters.
 *
 * Why: Enables campaign tracking by auto-appending UTM parameters
 * to shared links, with template support for consistency.
 */


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

// ============================================================================
// LINK DETECTION
// ============================================================================

/**
 * Find all URLs in a caption.
 */
export function extractUrlsFromCaption(caption: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    const matches = caption.match(urlRegex);
    return matches ?? [];
}
