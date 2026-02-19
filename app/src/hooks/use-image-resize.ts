/**
 * useImageResize - Auto-resize images for platform compliance
 * Why: When an image exceeds a platform's recommended width, this hook
 * calls the resize API and returns the resized media items + alert data.
 * Results are cached by sourceId+platform+postType to avoid redundant calls.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PLATFORM_SPECS, type Platform, type PostType } from '@/lib/platform-config';

/** Shape of the MediaItem used throughout the compose flow */
interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
    size: number;
    filename?: string;
    mimeType?: string;
}

/** Alert displayed below the preview when resizing occurs */
export interface ResizeAlert {
    originalFilename: string;
    originalWidth: number;
    targetWidth: number;
    platform: Platform;
    mediaId: string;
}

interface ResizeResult {
    /** Media items with resized replacements where applicable */
    resizedMedia: MediaItem[];
    /** Alerts for each image that was resized */
    resizeAlerts: ResizeAlert[];
    /** Whether resize calls are in progress */
    isResizing: boolean;
}

/** Cache key → resized media item to avoid redundant API calls */
type ResizeCache = Map<string, MediaItem>;

/**
 * Builds a cache key for a resize operation.
 * Why: Same image on same platform+postType doesn't need to be resized again.
 */
function buildCacheKey(mediaId: string, platform: Platform, postType: string): string {
    return `${mediaId}:${platform}:${postType}`;
}

/**
 * Hook that auto-resizes images exceeding a platform's recommended width.
 * @param media - Current media items in the composer
 * @param platform - Active platform being previewed
 * @param postType - Active post type (feed, story, reel, etc.)
 * @param enabled - Whether auto-resize is enabled (toggle state)
 */
export function useImageResize(
    media: MediaItem[],
    platform: Platform | undefined,
    postType: string | undefined,
    enabled: boolean = true,
): ResizeResult {
    const [resizedMedia, setResizedMedia] = useState<MediaItem[]>(media);
    const [resizeAlerts, setResizeAlerts] = useState<ResizeAlert[]>([]);
    const [isResizing, setIsResizing] = useState(false);
    const cacheRef = useRef<ResizeCache>(new Map());
    const abortRef = useRef<AbortController | null>(null);

    const processResize = useCallback(async (
        items: MediaItem[],
        plat: Platform,
        pt: string,
        signal: AbortSignal,
    ) => {
        // Look up the platform's image constraints for this post type
        const spec = PLATFORM_SPECS[plat];
        const constraints = spec?.mediaConstraints?.[pt as PostType];
        const imageConstraints = constraints?.image;

        if (!imageConstraints?.recommendedWidth) {
            // No image constraints or no recommendedWidth — pass through
            return { media: items, alerts: [] as ResizeAlert[] };
        }

        const targetWidth = imageConstraints.recommendedWidth;
        const resultMedia: MediaItem[] = [];
        const alerts: ResizeAlert[] = [];

        for (const item of items) {
            if (signal.aborted) break;

            // Only resize images that significantly exceed the recommended width
            // Why: 10% tolerance avoids unnecessary resizing of nearly-correct images
            if (item.type !== 'image' || !item.width || item.width <= targetWidth * 1.10) {
                resultMedia.push(item);
                continue;
            }

            const cacheKey = buildCacheKey(item.id, plat, pt);
            const cached = cacheRef.current.get(cacheKey);

            if (cached) {
                resultMedia.push(cached);
                alerts.push({
                    originalFilename: item.filename ?? 'image',
                    originalWidth: item.width,
                    targetWidth,
                    platform: plat,
                    mediaId: item.id,
                });
                continue;
            }

            // Call the resize API
            try {
                const response = await fetch('/api/media/resize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceMediaId: item.id,
                        targetWidth,
                        platform: plat,
                        postType: pt,
                    }),
                    signal,
                });

                if (!response.ok) {
                    // Resize failed — use original
                    resultMedia.push(item);
                    continue;
                }

                const data = await response.json();

                if (data.skipped) {
                    resultMedia.push(item);
                    continue;
                }

                const resized: MediaItem = {
                    id: data.media.id,
                    url: data.media.url,
                    thumbnailUrl: data.media.thumbnailUrl,
                    type: 'image',
                    width: data.media.width,
                    height: data.media.height,
                    size: data.media.size,
                    filename: data.media.filename,
                    mimeType: data.media.mimeType,
                };

                // Cache the result
                cacheRef.current.set(cacheKey, resized);

                resultMedia.push(resized);
                alerts.push({
                    originalFilename: item.filename ?? 'image',
                    originalWidth: data.originalWidth ?? item.width,
                    targetWidth,
                    platform: plat,
                    mediaId: item.id,
                });
            } catch (err) {
                if ((err as Error).name === 'AbortError') break;
                // On error, fall back to original
                resultMedia.push(item);
            }
        }

        return { media: resultMedia, alerts };
    }, []);

    useEffect(() => {
        // Abort any in-flight resize calls
        abortRef.current?.abort();

        if (!platform || !postType || !enabled || media.length === 0) {
            setResizedMedia(media);
            setResizeAlerts([]);
            setIsResizing(false);
            return;
        }

        const abortController = new AbortController();
        abortRef.current = abortController;

        // Check if any image actually needs resizing
        const spec = PLATFORM_SPECS[platform];
        const constraints = spec?.mediaConstraints?.[postType as PostType];
        const imageConstraints = constraints?.image;
        const targetWidth = imageConstraints?.recommendedWidth;

        const needsResize = targetWidth && media.some(
            m => m.type === 'image' && m.width && m.width > targetWidth * 1.10,
        );

        if (!needsResize) {
            setResizedMedia(media);
            setResizeAlerts([]);
            setIsResizing(false);
            return;
        }

        setIsResizing(true);

        processResize(media, platform, postType, abortController.signal)
            .then(({ media: processed, alerts }) => {
                if (!abortController.signal.aborted) {
                    setResizedMedia(processed);
                    setResizeAlerts(alerts);
                    setIsResizing(false);
                }
            })
            .catch(() => {
                if (!abortController.signal.aborted) {
                    setResizedMedia(media);
                    setResizeAlerts([]);
                    setIsResizing(false);
                }
            });

        return () => {
            abortController.abort();
        };
    }, [media, platform, postType, enabled, processResize]);

    return { resizedMedia, resizeAlerts, isResizing };
}
