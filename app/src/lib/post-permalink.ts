/** Recover public links only for platforms whose post IDs define a permalink. */
export function getPostPermalink(platform: string, postId?: string | null): string | null {
    if (!postId) return null;
    switch (platform.toLowerCase()) {
        case 'pinterest':
            return /^\d+$/.test(postId) ? `https://www.pinterest.com/pin/${postId}/` : null;
        case 'youtube':
            return /^[\w-]{11}$/.test(postId) ? `https://www.youtube.com/watch?v=${postId}` : null;
        case 'facebook':
            return /^\d+(?:_\d+)?$/.test(postId) ? `https://www.facebook.com/${postId}` : null;
        case 'twitter':
            return /^\d+$/.test(postId) ? `https://x.com/i/web/status/${postId}` : null;
        case 'linkedin':
            return /^urn:li:(?:share|ugcPost|activity):\d+$/.test(postId)
                ? `https://www.linkedin.com/feed/update/${postId}/` : null;
        // Instagram media IDs, Threads IDs, and other opaque IDs need an API permalink.
        default:
            return null;
    }
}
