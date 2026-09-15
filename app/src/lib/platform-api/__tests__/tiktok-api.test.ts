// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platformFetch } from '@/lib/fetch-with-timeout';
import { checkPublishStatus, getTikTokVideoAnalytics, publishTikTokPhotoPost } from '../tiktok-api';

vi.mock('@/lib/fetch-with-timeout', () => ({ platformFetch: vi.fn(), UPLOAD_TIMEOUT_MS: 120_000 }));
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const fetchMock = vi.mocked(platformFetch);
const statusResponse = (fields: string) => new Response(
    `{"data":{"status":"PUBLISH_COMPLETE",${fields}},"error":{"code":"ok"}}`,
);

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());

describe('TikTok raw publish status', () => {
    it('preserves unquoted int64 IDs exactly and normalizes the documented field', async () => {
        fetchMock.mockResolvedValue(statusResponse(
            '"publicaly_available_post_id":[7391234567890123457,9223372036854775807,123]',
        ));
        expect(await checkPublishStatus('token', 'publish-id')).toEqual({
            success: true,
            data: {
                status: 'PUBLISH_COMPLETE',
                publiclyAvailablePostId: ['7391234567890123457', '9223372036854775807', '123'],
            },
        });
    });

    it.each(['publicaly_available_post_id', 'publiclyAvailablePostId'])(
        'supports string and numeric IDs in %s while filtering invalid values', async field => {
            fetchMock.mockResolvedValue(statusResponse(`"${field}":[
                "7391234567890123457",123,"v_pub_file~abc",null,true,{},[],
                0,-1,1.5,1e3,"1e3"," 123","01","",9223372036854775808
            ]`));
            expect((await checkPublishStatus('token', 'publish-id')).data?.publiclyAvailablePostId)
                .toEqual(['7391234567890123457', '123']);
        },
    );

    it('prefers the official field even when empty', async () => {
        fetchMock.mockResolvedValue(statusResponse(
            '"publicaly_available_post_id":[],"publiclyAvailablePostId":[123]',
        ));
        expect((await checkPublishStatus('token', 'publish-id')).data?.publiclyAvailablePostId).toEqual([]);
    });

    it.each(['{}', '{"publicaly_available_post_id":"123"}', '{"publicaly_available_post_id":null}'])(
        'handles missing or malformed ID lists: %s', async fields => {
            fetchMock.mockResolvedValue(new Response(`{"data":${fields}}`));
            expect(await checkPublishStatus('token', 'publish-id')).toEqual({
                success: true, data: { status: 'PROCESSING', publiclyAvailablePostId: undefined },
            });
        },
    );

    it('retains API errors and leaves escaped strings untouched', async () => {
        const message = 'Invalid "123" ID \\ 7391234567890123457';
        fetchMock.mockResolvedValue(new Response(JSON.stringify({
            error: { code: 'invalid_publish_id', message },
        })));
        expect(await checkPublishStatus('token', 'bad-id')).toEqual({
            success: false, error: message, errorCode: 'invalid_publish_id',
        });
    });

    it('rejects malformed raw JSON', async () => {
        fetchMock.mockResolvedValue(statusResponse('"publicaly_available_post_id":[01]'));
        expect((await checkPublishStatus('token', 'publish-id')).success).toBe(false);
    });

    it('uses the same lossless normalization in photo polling', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValueOnce(new Response('{"data":{"publish_id":"photo-id"}}'))
            .mockResolvedValueOnce(statusResponse('"publicaly_available_post_id":["invalid",7391234567890123457]'));
        const pending = publishTikTokPhotoPost('token', {
            title: 'Photo', imageUrls: ['https://example.com/photo.jpg'], privacyLevel: 'PUBLIC_TO_EVERYONE',
        });
        await vi.runAllTimersAsync();
        expect(await pending).toEqual({
            success: true, data: { publishId: 'photo-id', postId: '7391234567890123457' },
        });
    });
});

describe('TikTok video metrics', () => {
    it('reports views and impressions without treating views as unique reach', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({
            data: { videos: [{ view_count: 100, like_count: 10, comment_count: 2, share_count: 3 }] },
            error: { code: 'ok' },
        })));
        expect(await getTikTokVideoAnalytics('token', ['123'])).toEqual({
            success: true,
            data: [{ impressions: 100, videoViews: 100, reach: 0, likes: 10, comments: 2,
                shares: 3, saves: 0, clicks: 0, engagementRate: 0 }],
        });
    });

    it('retains the API error code', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({
            error: { code: 'access_token_invalid', message: 'Token expired' },
        })));
        expect(await getTikTokVideoAnalytics('token', ['123'])).toEqual({
            success: false, error: 'Token expired', errorCode: 'access_token_invalid',
        });
    });

    it('does not report successful metrics when no videos are returned', async () => {
        fetchMock.mockResolvedValue(new Response('{"data":{"videos":[]},"error":{"code":"ok"}}'));
        expect((await getTikTokVideoAnalytics('token', ['123'])).success).toBe(false);
    });
});
