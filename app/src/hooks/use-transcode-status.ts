"use client"

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TranscodeStatusInfo {
    status: 'pending' | 'processing' | 'completed' | 'failed' | null;
    progress: number;
    transcodedUrl: string | null;
}

/**
 * Polls transcode status for media items that are still transcoding.
 * Why: After upload, videos are transcoded async by a BullMQ worker.
 * This hook polls the status endpoint every 2s so the compose UI can
 * show a progress bar and know when transcoding is done.
 *
 * @param mediaIds - IDs of media items to track (only videos with pending/processing status)
 * @returns Map of mediaId -> { status, progress, transcodedUrl }
 */
export function useTranscodeStatus(
    transcodingMediaIds: string[],
): Map<string, TranscodeStatusInfo> {
    const [statusMap, setStatusMap] = useState<Map<string, TranscodeStatusInfo>>(new Map());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Track which IDs are still active (not completed/failed) to stop polling
    const activeIdsRef = useRef<Set<string>>(new Set());

    const pollStatus = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return;

        const results = await Promise.allSettled(
            ids.map(async (id) => {
                const res = await fetch(`/api/media/${id}/transcode-status`);
                if (!res.ok) return null;
                const data = await res.json() as TranscodeStatusInfo;
                return { id, data };
            }),
        );

        setStatusMap((prev) => {
            const next = new Map(prev);
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    const { id, data } = result.value;
                    next.set(id, data);

                    // Remove from active set if terminal
                    if (data.status === 'completed' || data.status === 'failed' || data.status === null) {
                        activeIdsRef.current.delete(id);
                    }
                }
            }
            return next;
        });
    }, []);

    // Start/stop polling when transcodingMediaIds change
    useEffect(() => {
        // Update active IDs
        const newIds = new Set(transcodingMediaIds);
        activeIdsRef.current = newIds;

        if (newIds.size === 0) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        // Do an immediate poll
        pollStatus(transcodingMediaIds);

        // Poll every 2 seconds
        intervalRef.current = setInterval(() => {
            const activeIds = [...activeIdsRef.current];
            if (activeIds.length === 0) {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                return;
            }
            pollStatus(activeIds);
        }, 2000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [transcodingMediaIds.join(','), pollStatus]); // eslint-disable-line react-hooks/exhaustive-deps

    return statusMap;
}
