/**
 * Web Share Level 2 Utilities
 * Share text, URLs, and files using the native share dialog
 * 
 * Why: Native share gives users access to all their apps,
 * not just a limited set of social buttons.
 */

/** Check if Web Share API is supported */
export function isShareSupported(): boolean {
    return typeof navigator !== 'undefined' && 'share' in navigator;
}

/** Check if file sharing is supported (Web Share Level 2) */
export function isFileShareSupported(): boolean {
    return isShareSupported() && typeof navigator !== 'undefined' && 'canShare' in navigator;
}

export interface ShareData {
    /** Share dialog title */
    title?: string;
    /** Text content to share */
    text?: string;
    /** URL to share */
    url?: string;
    /** Files to share (Web Share Level 2) */
    files?: File[];
}

export interface ShareResult {
    success: boolean;
    error?: string;
    /** Whether sharing was cancelled by user */
    cancelled?: boolean;
}

/**
 * Share content using native share dialog
 * Falls back gracefully on unsupported browsers
 */
export async function share(data: ShareData): Promise<ShareResult> {
    if (!isShareSupported()) {
        return {
            success: false,
            error: 'Web Share API not supported in this browser',
        };
    }

    // Validate files can be shared
    if (data.files && data.files.length > 0) {
        if (!isFileShareSupported()) {
            return {
                success: false,
                error: 'File sharing not supported in this browser',
            };
        }

        // Check if specific files can be shared
        const canShare = navigator.canShare?.({ files: data.files });
        if (!canShare) {
            return {
                success: false,
                error: 'These file types cannot be shared',
            };
        }
    }

    try {
        await navigator.share(data);
        return { success: true };
    } catch (error) {
        // User cancelled the share dialog
        if (error instanceof Error && error.name === 'AbortError') {
            return { success: false, cancelled: true };
        }

        // Other errors (e.g., permission denied)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Share failed',
        };
    }
}

/**
 * Share a post's content
 */
export async function sharePost(post: {
    caption: string;
    url?: string;
    mediaUrl?: string;
}): Promise<ShareResult> {
    // Build share text
    const text = post.caption;
    const url = post.url || window.location.href;

    return share({ title: 'Share Post', text, url });
}

/**
 * Share a post with its media file
 */
export async function sharePostWithMedia(post: {
    caption: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
}): Promise<ShareResult> {
    // Fetch the media file
    try {
        const response = await fetch(post.mediaUrl);
        if (!response.ok) {
            return share({ title: 'Share Post', text: post.caption });
        }

        const blob = await response.blob();
        const extension = post.mediaType === 'video' ? 'mp4' : 'jpg';
        const mimeType = post.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

        const file = new File([blob], `post.${extension}`, { type: mimeType });

        return share({
            title: 'Share Post',
            text: post.caption,
            files: [file],
        });
    } catch {
        // Fall back to text-only share
        return share({ title: 'Share Post', text: post.caption });
    }
}

/**
 * Copy to clipboard as fallback when share not supported
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
            return true;
        } catch {
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}
