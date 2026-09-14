import { PLATFORM_SPECS, type Platform, type PostType } from '@/lib/platform-config';

/** Geometry is shared by the preview client and server; never stretch or enlarge. */
export function getImageResizePlan(
    width: number,
    height: number,
    platform: Platform,
    postType: string,
    focalPoint?: { x: number; y: number },
): { width: number; height: number; extract?: { left: number; top: number; width: number; height: number } } | null {
    const spec = PLATFORM_SPECS[platform];
    const constraints = spec?.mediaConstraints?.[postType as PostType]?.image;
    if (!constraints || !spec.supportedPostTypes.includes(postType as PostType)
        || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;

    const ratio = width / height;
    const allowed = constraints.aspectRatios.filter(value => value !== 'any').map(value => {
        const [w, h] = value.split(':').map(Number);
        return w / h;
    }).filter(value => Number.isFinite(value) && value > 0);
    // Google posts intentionally use landscape, even when the source is square.
    const target = platform === 'google_business' ? 4 / 3
        : constraints.aspectRatios.includes('any') || allowed.length === 0 ? ratio
            : allowed.reduce((best, candidate) => Math.abs(Math.log(candidate / ratio)) < Math.abs(Math.log(best / ratio)) ? candidate : best);
    const crop = Math.abs(ratio / target - 1) > 0.01;
    const cropWidth = crop ? Math.min(width, Math.round(height * target)) : width;
    const cropHeight = crop ? Math.min(height, Math.round(width / target)) : height;
    const position = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.min(100, value!)) / 100 : 0.5;
    const extract = crop ? {
        left: Math.round((width - cropWidth) * position(focalPoint?.x)),
        top: Math.round((height - cropHeight) * position(focalPoint?.y)),
        width: Math.max(1, cropWidth),
        height: Math.max(1, cropHeight),
    } : undefined;
    const recommendedWidth = constraints.recommendedWidth ?? constraints.maxWidth ?? cropWidth;
    const scale = Math.min(1, recommendedWidth / cropWidth);
    if (!crop && scale === 1) return null;
    return {
        width: Math.max(1, Math.round(cropWidth * scale)),
        height: Math.max(1, Math.round(cropHeight * scale)),
        ...(extract ? { extract } : {}),
    };
}
