/** Auto-resize previews and awaitable, per-account submission preparation. */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PLATFORM_SPECS, type Platform, type PostType } from '@/lib/platform-config';
import { getImageResizePlan } from '@/lib/image-resize-policy';
import type { MediaItem } from '@/components/compose/platform-editor';

export interface ResizeAlert {
    originalFilename: string;
    originalWidth: number;
    targetWidth: number;
    targetHeight?: number;
    platform: Platform;
    mediaId: string;
}

interface PreparedMedia {
    media: MediaItem[];
    alerts: ResizeAlert[];
}

export function useImageResize(
    media: MediaItem[],
    platform: Platform | undefined,
    postType: string | undefined,
    enabled = true,
) {
    // Shared promises deduplicate preview/submission work without tying submission
    // to an abort controller owned by a transient preview tab.
    const cache = useRef(new Map<string, Promise<MediaItem>>());
    const [preview, setPreview] = useState<{
        key: string;
        result?: PreparedMedia;
        error?: Error;
    }>();
    const key = JSON.stringify([media, platform, postType, enabled]);

    const prepareMedia = useCallback(async (
        items: MediaItem[], plat: Platform, pt: string,
    ): Promise<PreparedMedia> => {
        const alerts: ResizeAlert[] = [];
        const result = await Promise.all(items.map(async (item) => {
            const constraints = PLATFORM_SPECS[plat]?.mediaConstraints?.[pt as PostType]?.image;
            if (item.type !== 'image' || !constraints) return item;
            const plan = item.width && item.height
                ? getImageResizePlan(item.width, item.height, plat, pt, item.focalPoint)
                : undefined;
            if (plan === null) return item;
            // Unknown dimensions still go to the server, which reads source metadata.
            const targetWidth = constraints.recommendedWidth ?? plan?.width ?? item.width;
            const cacheKey = JSON.stringify([
                item.id, item.url, item.width, item.height, plat, pt,
                item.focalPoint ?? { x: 50, y: 50 }, plan,
            ]);
            let pending = cache.current.get(cacheKey);
            if (!pending) {
                pending = (async () => {
                    const response = await fetch('/api/media/resize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sourceMediaId: item.id, targetWidth, platform: plat,
                            postType: pt, focalPoint: item.focalPoint,
                        }),
                    });
                    if (!response.ok) {
                        const data = await response.json().catch(() => null);
                        throw new Error(data?.error || `Could not prepare ${item.filename ?? 'image'} for ${plat} (HTTP ${response.status})`);
                    }
                    const data = await response.json();
                    if (data.skipped) return item;
                    if (!data.media?.id || !data.media?.url) throw new Error(`Invalid image resize response for ${plat}`);
                    return { ...item, ...data.media, type: 'image' as const, focalPoint: item.focalPoint };
                })();
                cache.current.set(cacheKey, pending);
                // Failed operations are retryable, including at submission time.
                void pending.catch(() => { cache.current.delete(cacheKey); });
            }
            const resized = await pending;
            if (resized.id !== item.id) alerts.push({
                originalFilename: item.filename ?? 'image',
                originalWidth: item.width ?? 0,
                targetWidth: resized.width ?? targetWidth ?? 0,
                targetHeight: resized.height,
                platform: plat,
                mediaId: item.id,
            });
            return resized;
        }));
        return { media: result, alerts };
    }, []);

    useEffect(() => {
        if (!enabled || !platform || !postType || !media.length) return;
        let current = true;
        void prepareMedia(media, platform, postType).then(
            result => { if (current) setPreview({ key, result }); },
            error => { if (current) setPreview({ key, error: error instanceof Error ? error : new Error('Image preparation failed') }); },
        );
        return () => { current = false; };
    }, [key, media, platform, postType, enabled, prepareMedia]);

    const active = enabled && !!platform && !!postType && media.length > 0;
    const current = active && preview?.key === key ? preview : undefined;
    return {
        // Never expose a prior tab's or prior focal point's transformed media.
        resizedMedia: current?.result?.media ?? media,
        resizeAlerts: current?.result?.alerts ?? [],
        isResizing: active && !current,
        resizeError: current?.error,
        prepareMedia,
    };
}
