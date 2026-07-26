import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishToTikTok } from '../tiktok';
import { publishTikTokPhotoPost, publishTikTokVideo } from '@/lib/platform-api/tiktok-api';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/platform-api/tiktok-api', () => ({
    checkPublishStatus: vi.fn(),
    publishTikTokPhotoPost: vi.fn(),
    publishTikTokVideo: vi.fn(),
}));

const account = {
    id: 'account-1',
    platform: 'TIKTOK',
    accountName: 'creator',
    accessToken: 'token',
} as any;

const basePayload = {
    caption: 'Caption',
    mediaUrls: ['https://example.com/video.mp4'],
    mediaType: 'video',
    postType: 'post',
    tiktokPrivacyLevel: 'SELF_ONLY',
} as any;

describe('publishToTikTok pending lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns a pending failure when a video has no public post ID yet', async () => {
        vi.mocked(publishTikTokVideo).mockResolvedValue({
            success: true,
            data: { publishId: 'v_pub_123' },
        });

        const result = await publishToTikTok(account, basePayload);

        expect(result).toMatchObject({
            success: false,
            errorCode: 'PUBLISH_PENDING',
            postId: 'tiktok_pending:v_pub_123',
        });
    });

    it('returns a pending failure when a photo post has no public post ID yet', async () => {
        vi.mocked(publishTikTokPhotoPost).mockResolvedValue({
            success: true,
            data: { publishId: 'p_pub_123' },
        });

        const result = await publishToTikTok(account, {
            ...basePayload,
            mediaUrls: ['https://example.com/photo.jpg'],
            mediaType: 'image',
        });

        expect(result).toMatchObject({
            success: false,
            errorCode: 'PUBLISH_PENDING',
            postId: 'tiktok_pending:p_pub_123',
        });
    });
});
