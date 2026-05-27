const failedImageUrls = new Set<string>();

function isCacheableUrl(src: string | null | undefined): src is string {
    return typeof src === 'string' && src.length > 0 && !src.startsWith('data:') && !src.startsWith('blob:');
}

export function hasFailedImageUrl(src: string | null | undefined): boolean {
    return isCacheableUrl(src) && failedImageUrls.has(src);
}

export function markFailedImageUrl(src: string | null | undefined): void {
    if (isCacheableUrl(src)) {
        failedImageUrls.add(src);
    }
}

export function clearFailedImageUrl(src: string | null | undefined): void {
    if (isCacheableUrl(src)) {
        failedImageUrls.delete(src);
    }
}
