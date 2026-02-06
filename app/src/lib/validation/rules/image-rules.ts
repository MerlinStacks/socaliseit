/**
 * Image Validation Rules
 * Platform-specific image aspect ratio, resolution, and count validation.
 *
 * Why: Ensures images meet platform requirements to avoid cropping or rejection.
 */

import type { ValidationRule } from '../types';
import { PLATFORM_LIMITS } from '../limits';

/**
 * Image validation rules for all platforms.
 */
export const imageRules: ValidationRule[] = [
    {
        id: 'image-aspect-instagram',
        platform: 'instagram',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            if (images.length === 0) return { status: 'pass', message: 'No images to validate' };

            const issues: string[] = [];

            images.forEach((img) => {
                const ratio = img.width / img.height;
                const isSquare = Math.abs(ratio - 1) < 0.01;
                const isLandscape = Math.abs(ratio - 1.91) < 0.1;
                const isPortrait = Math.abs(ratio - 0.8) < 0.1;

                if (!isSquare && !isLandscape && !isPortrait) {
                    issues.push(`${img.id}: aspect ratio ${ratio.toFixed(2)} not optimal`);
                }
            });

            if (issues.length > 0) {
                return {
                    status: 'warning',
                    message: 'Image aspect ratio may be cropped',
                    details: issues.join(', '),
                    canAutoFix: false,
                };
            }

            return { status: 'pass', message: 'Image aspect ratio (1:1)' };
        },
    },

    {
        id: 'image-resolution-instagram',
        platform: 'instagram',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            if (images.length === 0) return { status: 'pass', message: 'No images to validate' };

            const minWidth = PLATFORM_LIMITS.instagram.image.minWidth;
            const recommended = 1440;

            for (const img of images) {
                if (img.width < minWidth) {
                    return {
                        status: 'error',
                        message: `Image too small (${img.width}px, min: ${minWidth}px)`,
                        canAutoFix: false,
                    };
                }
                if (img.width < recommended) {
                    return {
                        status: 'warning',
                        message: `Image resolution ${img.width}px (recommended: ${recommended}px)`,
                        canAutoFix: true,
                    };
                }
            }

            return { status: 'pass', message: 'Image resolution optimal' };
        },
    },

    {
        id: 'image-count-bluesky',
        platform: 'bluesky',
        type: 'image',
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            const maxFiles = PLATFORM_LIMITS.bluesky.image.maxFiles || 4;
            if (images.length > maxFiles) {
                return {
                    status: 'error',
                    message: `Bluesky allows max ${maxFiles} images (found ${images.length})`,
                };
            }
            return { status: 'pass', message: `Images (${images.length}/${maxFiles})` };
        },
    },

    {
        id: 'carousel-count-instagram',
        platform: 'instagram',
        type: 'image',
        postTypes: ['carousel'],
        check: (ctx) => {
            const mediaCount = ctx.media.length;
            if (mediaCount < 2) {
                return {
                    status: 'warning',
                    message: 'Carousels should have at least 2 items',
                };
            }
            if (mediaCount > 10) {
                return {
                    status: 'error',
                    message: `Instagram carousels allow max 10 items (found ${mediaCount})`,
                };
            }
            return { status: 'pass', message: `Carousel items (${mediaCount}/10)` };
        },
    },

    {
        id: 'carousel-aspect-ratio-consistency',
        platform: 'instagram',
        type: 'image',
        postTypes: ['carousel'],
        check: (ctx) => {
            const images = ctx.media.filter((m) => m.type === 'image');
            if (images.length < 2) return { status: 'pass', message: 'N/A' };

            // Calculate aspect ratio of first image as reference
            const firstRatio = images[0].width / images[0].height;

            // Check if any image has significantly different aspect ratio (>10% variance)
            const inconsistentItems = images.filter(img => {
                const ratio = img.width / img.height;
                return Math.abs(ratio - firstRatio) > 0.1;
            });

            if (inconsistentItems.length > 0) {
                return {
                    status: 'warning',
                    message: `Carousel has mixed aspect ratios (${inconsistentItems.length} items differ)`,
                    details: 'Instagram may crop images with different aspect ratios',
                };
            }

            return { status: 'pass', message: 'Carousel aspect ratios consistent' };
        },
    },
];
