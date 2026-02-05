/**
 * Instagram Profile Scraper
 *
 * Why: Official Instagram Graph API doesn't allow fetching third-party profile data.
 * This scraper extracts public profile information for competitor tracking.
 *
 * Warning: Scraping violates Instagram ToS. Rate limit appropriately.
 */

import { logger } from '@/lib/logger';

export interface ScrapedInstagramProfile {
    username: string;
    displayName: string;
    followers: number;
    following: number;
    postCount: number;
    avatarUrl: string | null;
    isVerified: boolean;
    bio: string | null;
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

/**
 * Scrape public Instagram profile data
 */
export async function scrapeInstagramProfile(
    username: string
): Promise<ScrapedInstagramProfile | null> {
    const cleanUsername = username.toLowerCase().replace('@', '').trim();

    try {
        // Try the web profile page and parse embedded JSON
        const profileData = await fetchProfileFromWeb(cleanUsername);
        if (profileData) {
            return profileData;
        }

        logger.warn(`[InstagramScraper] Failed to scrape @${cleanUsername}`);
        return null;
    } catch (error) {
        logger.error(`[InstagramScraper] Error scraping @${cleanUsername}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Fetch profile from Instagram web page
 * Parses the embedded JSON data from the page source
 */
async function fetchProfileFromWeb(
    username: string
): Promise<ScrapedInstagramProfile | null> {
    const url = `https://www.instagram.com/${username}/`;
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    const response = await fetch(url, {
        headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        },
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        logger.warn(`[InstagramScraper] HTTP ${response.status} for @${username}`);
        return null;
    }

    const html = await response.text();

    // Look for the script containing profile data
    // Instagram embeds user data in various JSON structures
    const patterns = [
        // Pattern 1: Direct script data
        /"user":\s*({[^}]+?"username":\s*"[^"]+?"[^}]*})/,
        // Pattern 2: Profile page data
        /"ProfilePage":\s*\[({.*?})\]/,
        // Pattern 3: Meta tags fallback
        /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/,
    ];

    // Try to extract follower count from meta description
    // Format: "X Followers, Y Following, Z Posts - See Instagram photos..."
    const metaMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
    if (metaMatch) {
        const description = metaMatch[1];
        const stats = parseMetaDescription(description);
        if (stats) {
            // Extract other info from page
            const displayName = extractDisplayName(html) || username;
            const avatarUrl = extractAvatarUrl(html);
            const isVerified = html.includes('"is_verified":true') ||
                html.includes('verified_badge') ||
                html.includes('VerifiedBadge');
            const bio = extractBio(html);

            return {
                username,
                displayName,
                followers: stats.followers,
                following: stats.following,
                postCount: stats.posts,
                avatarUrl,
                isVerified,
                bio,
            };
        }
    }

    // Try to find JSON data in scripts
    const scriptMatch = html.match(/<script[^>]*>window\._sharedData\s*=\s*({.+?});<\/script>/);
    if (scriptMatch) {
        try {
            const data = JSON.parse(scriptMatch[1]);
            const user = data?.entry_data?.ProfilePage?.[0]?.graphql?.user;
            if (user) {
                return {
                    username: user.username,
                    displayName: user.full_name || user.username,
                    followers: user.edge_followed_by?.count || 0,
                    following: user.edge_follow?.count || 0,
                    postCount: user.edge_owner_to_timeline_media?.count || 0,
                    avatarUrl: user.profile_pic_url_hd || user.profile_pic_url,
                    isVerified: user.is_verified || false,
                    bio: user.biography || null,
                };
            }
        } catch {
            // JSON parse failed, continue to fallback
        }
    }

    return null;
}

/**
 * Parse Instagram meta description for stats
 * Format: "123K Followers, 456 Following, 789 Posts..."
 */
function parseMetaDescription(description: string): { followers: number; following: number; posts: number } | null {
    // Handle various formats: "1,234 Followers", "1.2M Followers", "12K Followers"
    const followersMatch = description.match(/([\d,.]+[KMB]?)\s*Followers/i);
    const followingMatch = description.match(/([\d,.]+[KMB]?)\s*Following/i);
    const postsMatch = description.match(/([\d,.]+[KMB]?)\s*Posts/i);

    if (!followersMatch) return null;

    return {
        followers: parseCount(followersMatch[1]),
        following: followingMatch ? parseCount(followingMatch[1]) : 0,
        posts: postsMatch ? parseCount(postsMatch[1]) : 0,
    };
}

/**
 * Parse count string like "1.2M", "12K", "1,234" to number
 */
function parseCount(str: string): number {
    const cleaned = str.replace(/,/g, '').trim().toUpperCase();

    if (cleaned.endsWith('B')) {
        return Math.round(parseFloat(cleaned) * 1_000_000_000);
    }
    if (cleaned.endsWith('M')) {
        return Math.round(parseFloat(cleaned) * 1_000_000);
    }
    if (cleaned.endsWith('K')) {
        return Math.round(parseFloat(cleaned) * 1_000);
    }

    return parseInt(cleaned, 10) || 0;
}

/**
 * Extract display name from HTML
 */
function extractDisplayName(html: string): string | null {
    const match = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    if (match) {
        // Format: "Display Name (@username) • Instagram photos and videos"
        const title = match[1];
        const nameMatch = title.match(/^(.+?)\s*\(@/);
        if (nameMatch) {
            return nameMatch[1].trim();
        }
    }
    return null;
}

/**
 * Extract avatar URL from HTML
 */
function extractAvatarUrl(html: string): string | null {
    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (ogMatch) {
        return ogMatch[1];
    }

    // Try profile_pic_url in JSON
    const picMatch = html.match(/"profile_pic_url(?:_hd)?"\s*:\s*"([^"]+)"/);
    if (picMatch) {
        return picMatch[1].replace(/\\u0026/g, '&');
    }

    return null;
}

/**
 * Extract bio from HTML
 */
function extractBio(html: string): string | null {
    const match = html.match(/"biography"\s*:\s*"([^"]+)"/);
    if (match) {
        return match[1]
            .replace(/\\n/g, '\n')
            .replace(/\\u[\dA-Fa-f]{4}/g, (m) =>
                String.fromCharCode(parseInt(m.slice(2), 16))
            );
    }
    return null;
}

// ============================================================================
// POST SCRAPING
// ============================================================================

export interface ScrapedInstagramPost {
    postId: string;
    shortcode: string;
    caption: string;
    likes: number;
    comments: number;
    mediaType: 'image' | 'video' | 'carousel';
    thumbnailUrl: string | null;
    postedAt: Date;
}

/**
 * Scrape recent posts from a public Instagram profile
 * 
 * Why: Enables competitor post analysis, timing analysis, and hashtag extraction.
 * Returns up to 12 most recent posts (what's visible on the profile grid).
 */
export async function scrapeInstagramPosts(
    username: string,
    limit: number = 12
): Promise<ScrapedInstagramPost[]> {
    const cleanUsername = username.toLowerCase().replace('@', '').trim();
    const url = `https://www.instagram.com/${cleanUsername}/`;
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            logger.warn(`[InstagramScraper] HTTP ${response.status} for posts @${cleanUsername}`);
            return [];
        }

        const html = await response.text();
        const posts: ScrapedInstagramPost[] = [];

        // Try to find posts in window._sharedData (legacy method)
        const sharedDataMatch = html.match(/<script[^>]*>window\._sharedData\s*=\s*({.+?});<\/script>/);
        if (sharedDataMatch) {
            try {
                const data = JSON.parse(sharedDataMatch[1]);
                const edges = data?.entry_data?.ProfilePage?.[0]?.graphql?.user?.edge_owner_to_timeline_media?.edges;

                if (edges && Array.isArray(edges)) {
                    for (const edge of edges.slice(0, limit)) {
                        const node = edge.node;
                        if (!node) continue;

                        posts.push({
                            postId: node.id,
                            shortcode: node.shortcode,
                            caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                            likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                            comments: node.edge_media_to_comment?.count || 0,
                            mediaType: parseMediaType(node.__typename || node.media_type),
                            thumbnailUrl: node.thumbnail_src || node.display_url || null,
                            postedAt: new Date(node.taken_at_timestamp * 1000),
                        });
                    }
                }
            } catch {
                logger.debug(`[InstagramScraper] Failed to parse _sharedData for @${cleanUsername}`);
            }
        }

        // If _sharedData didn't work, try parsing embedded JSON chunks
        if (posts.length === 0) {
            const timelineMatch = html.match(/"xdt_api__v1__feed__user_timeline_graphql_connection"\s*:\s*({[^}]+edges[^}]+})/);
            if (timelineMatch) {
                try {
                    const edgesMatch = html.match(/"edges"\s*:\s*\[({[^[\]]*?"node"[^[\]]*}(?:,{[^[\]]*?"node"[^[\]]*})*)\]/);
                    if (edgesMatch) {
                        const edgesJson = `[${edgesMatch[1]}]`;
                        const edges = JSON.parse(edgesJson);

                        for (const edge of edges.slice(0, limit)) {
                            const node = edge.node || edge;
                            if (!node?.id) continue;

                            posts.push({
                                postId: node.id,
                                shortcode: node.code || node.shortcode || '',
                                caption: extractCaptionFromNode(node),
                                likes: node.like_count || node.edge_liked_by?.count || 0,
                                comments: node.comment_count || node.edge_media_to_comment?.count || 0,
                                mediaType: parseMediaType(node.media_type || node.__typename),
                                thumbnailUrl: node.thumbnail_url || node.display_url || null,
                                postedAt: new Date((node.taken_at || node.taken_at_timestamp || Date.now() / 1000) * 1000),
                            });
                        }
                    }
                } catch {
                    logger.debug(`[InstagramScraper] Failed to parse timeline data for @${cleanUsername}`);
                }
            }
        }

        // Fallback: Try to extract basic post info from shortcode links
        if (posts.length === 0) {
            const shortcodeMatches = html.matchAll(/\/p\/([A-Za-z0-9_-]+)\//g);
            const seenCodes = new Set<string>();

            for (const match of shortcodeMatches) {
                if (seenCodes.size >= limit) break;
                const shortcode = match[1];
                if (seenCodes.has(shortcode)) continue;
                seenCodes.add(shortcode);

                posts.push({
                    postId: shortcode,
                    shortcode,
                    caption: '',
                    likes: 0,
                    comments: 0,
                    mediaType: 'image',
                    thumbnailUrl: null,
                    postedAt: new Date(),
                });
            }
        }

        logger.info(`[InstagramScraper] Scraped ${posts.length} posts from @${cleanUsername}`);
        return posts;

    } catch (error) {
        logger.error(`[InstagramScraper] Error scraping posts for @${cleanUsername}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/**
 * Parse Instagram media type from various formats
 */
function parseMediaType(type: string | number | undefined): 'image' | 'video' | 'carousel' {
    if (!type) return 'image';

    const typeStr = String(type).toLowerCase();

    if (typeStr.includes('video') || typeStr === '2') return 'video';
    if (typeStr.includes('carousel') || typeStr.includes('sidecar') || typeStr === '8') return 'carousel';
    return 'image';
}

/**
 * Extract caption text from various node structures
 */
function extractCaptionFromNode(node: Record<string, unknown>): string {
    if (typeof node.caption === 'string') return node.caption;

    const captionObj = node.caption as { text?: string } | undefined;
    if (captionObj?.text) return captionObj.text;

    const edgeCaption = node.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> } | undefined;
    if (edgeCaption?.edges?.[0]?.node?.text) {
        return edgeCaption.edges[0].node.text;
    }

    return '';
}

