/**
 * Shared local-file helpers for all platform APIs
 *
 * Why: `isLocalUrl` and `resolveLocalFilePath` were copy-pasted into
 * tiktok-api, youtube-api, linkedin-api, and instagram/upload. This
 * module is the single source of truth.
 */

import path from 'path';

/**
 * Check if a URL points to a locally-stored upload.
 *
 * Why: We check for `/uploads/`, `localhost`, and `127.0.0.1`
 * because Docker-hosted environments serve media from internal URLs
 * that cannot be reached by external platform APIs.
 */
export function isLocalUrl(url: string): boolean {
    return url.includes('/uploads/') || url.includes('localhost') || url.includes('127.0.0.1');
}

/**
 * Resolve a local upload URL to an absolute filesystem path.
 *
 * Why: Platform APIs need the on-disk path to read the file buffer
 * for binary uploads. Handles `http://`, `file://`, and bare
 * `/uploads/...` paths.
 */
export function resolveLocalFilePath(url: string): string {
    let pathname = url;
    try {
        if (url.startsWith('http') || url.startsWith('file:')) {
            const parsed = new URL(url);
            pathname = parsed.pathname;
        } else if (url.includes('/uploads/')) {
            pathname = url.substring(url.indexOf('/uploads/'));
        }
    } catch {
        // Fallback to original path
    }

    // Why (BUG-65): API-served transcoded files use /api/uploads/transcoded/
    // but the actual files live under public/uploads/transcoded/. Strip the
    // /api/ prefix so the resolved path matches the filesystem layout.
    pathname = pathname.replace(/^\/api\//, '/');

    // Why: Remove leading slash so path.join doesn't ignore `cwd`
    pathname = pathname.replace(/^[/\\]/, '');

    return path.join(process.cwd(), 'public', pathname);
}
