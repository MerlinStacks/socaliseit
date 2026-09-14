import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageResize } from '../use-image-resize';
import type { Platform } from '@/lib/platform-config';

const image = { id: 'source', url: '/source.jpg', type: 'image' as const, size: 100, width: 600, height: 600 };
const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url, options) => {
        const body = JSON.parse(options.body);
        return { ok: true, json: async () => ({ media: {
            ...image, id: `${body.platform}-${body.postType}-${body.focalPoint?.x ?? 50}`,
            url: '/cropped.jpg', width: 600, height: 450,
        } }) };
    });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useImageResize', () => {
    it('requests actual Google landscape transformation even below recommended width', async () => {
        const media = [image];
        const { result } = renderHook(() => useImageResize(media, 'google_business', 'feed'));
        await waitFor(() => expect(result.current.isResizing).toBe(false));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            sourceMediaId: 'source', platform: 'google_business', postType: 'feed',
        });
        expect(result.current.resizedMedia[0].height).toBe(450);
    });

    it.each(['instagram', 'facebook', 'pinterest', 'linkedin', 'bluesky', 'threads'] as Platform[])(
        'preserves a small supported square for %s', async platform => {
            const media = [image];
            const { result } = renderHook(() => useImageResize(media, platform, platform === 'pinterest' ? 'pin' : 'feed'));
            await waitFor(() => expect(result.current.isResizing).toBe(false));
            expect(fetchMock).not.toHaveBeenCalled();
            expect(result.current.resizedMedia).toEqual(media);
        },
    );

    it('shares inflight work with submission and invalidates the cache on focal geometry changes', async () => {
        let resolve!: (value: unknown) => void;
        fetchMock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const media = [image];
        const { result, rerender } = renderHook(({ items }) => useImageResize(items, 'google_business', 'feed'), {
            initialProps: { items: media },
        });
        const submission = result.current.prepareMedia(media, 'google_business', 'feed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => {
            resolve({ ok: true, json: async () => ({ media: { ...image, id: 'first', url: '/first.jpg' } }) });
            await submission;
        });
        rerender({ items: [{ ...image, focalPoint: { x: 90, y: 50 } } as typeof image] });
        expect(result.current.resizedMedia[0].id).toBe('source');
        await waitFor(() => expect(result.current.resizedMedia[0].id).toBe('google_business-feed-90'));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each(['instagram', 'facebook', 'pinterest', 'linkedin'] as Platform[])(
        'transforms an unsupported small portrait ratio for %s', async platform => {
            const media = [{ ...image, width: 300, height: 1200 }];
            const { result } = renderHook(() => useImageResize(media, platform, platform === 'pinterest' ? 'pin' : 'feed'));
            await waitFor(() => expect(result.current.isResizing).toBe(false));
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );

    it.each(['bluesky', 'threads'] as Platform[])(
        'preserves an arbitrary small ratio for %s', async platform => {
            const media = [{ ...image, width: 300, height: 1200 }];
            const { result } = renderHook(() => useImageResize(media, platform, 'feed'));
            await waitFor(() => expect(result.current.isResizing).toBe(false));
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it('ignores a late response from a previous preview tab', async () => {
        let resolve!: (value: unknown) => void;
        fetchMock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const media = [image];
        const { result, rerender } = renderHook(({ platform }) => useImageResize(media, platform, 'feed'), {
            initialProps: { platform: 'google_business' as Platform },
        });
        rerender({ platform: 'instagram' });
        await act(async () => {
            resolve({ ok: true, json: async () => ({ media: { ...image, id: 'late', url: '/late.jpg' } }) });
        });
        await waitFor(() => expect(result.current.isResizing).toBe(false));
        expect(result.current.resizedMedia[0].id).toBe('source');
        expect(result.current.resizeAlerts).toEqual([]);
    });

    it('skips video media and post types without image constraints', async () => {
        const media = [{ ...image, type: 'video' as const }];
        const { result } = renderHook(() => useImageResize(media, 'google_business', 'feed', false));
        await result.current.prepareMedia(media, 'google_business', 'feed');
        await result.current.prepareMedia([image], 'youtube', 'feed');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces failures and rejects preparation instead of silently returning originals', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Crop failed' }) });
        const media = [image];
        const { result } = renderHook(() => useImageResize(media, 'google_business', 'feed'));
        await waitFor(() => expect(result.current.resizeError?.message).toBe('Crop failed'));
        await expect(result.current.prepareMedia(media, 'google_business', 'feed')).rejects.toThrow('Crop failed');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('prepares post types independently and passes through disabled previews', async () => {
        const media = [image];
        const { result } = renderHook(() => useImageResize(media, 'instagram', 'feed', false));
        expect(result.current.resizedMedia).toBe(media);
        const feed = await result.current.prepareMedia(media, 'instagram', 'feed');
        const story = await result.current.prepareMedia(media, 'instagram', 'story');
        expect(feed.media[0].id).toBe('source');
        expect(story.media[0].id).toBe('instagram-story-50');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
