import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishToTikTok } from '../tiktok';
import { checkPublishStatus, publishTikTokPhotoPost, publishTikTokVideo } from '@/lib/platform-api/tiktok-api';

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

    it.each(['error', 'throw', 'complete-without-id', 'processing'])('does not re-upload an accepted unknown outcome: %s', async scenario => {
        if (scenario === 'throw') vi.mocked(checkPublishStatus).mockRejectedValueOnce(new Error('network'));
        else vi.mocked(checkPublishStatus).mockResolvedValueOnce(scenario === 'error'
            ? { success: false, error: 'expired lookup' }
            : { success: true, data: { status: scenario === 'processing' ? 'PROCESSING_UPLOAD' : 'PUBLISH_COMPLETE' } } as never);
        const result = await publishToTikTok(account, { ...basePayload, tiktokPendingPublishId: 'accepted' });
        expect(result).toMatchObject({ success: false, errorCode: 'PUBLISH_PENDING', postId: 'tiktok_pending:accepted' });
        expect(publishTikTokVideo).not.toHaveBeenCalled();
        expect(publishTikTokPhotoPost).not.toHaveBeenCalled();
    });

    it('returns the authoritative numeric ID without uploading', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValueOnce({ success: true, data: {
            status: 'PUBLISH_COMPLETE', publiclyAvailablePostId: ['invalid', '123456'],
        } });
        expect(await publishToTikTok(account, { ...basePayload, tiktokPendingPublishId: 'accepted' }))
            .toMatchObject({ success: true, postId: '123456' });
        expect(publishTikTokVideo).not.toHaveBeenCalled();
    });

    it('preserves accepted uploads even when retry payload lacks privacy selection', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValueOnce({ success: false });
        expect(await publishToTikTok(account, { ...basePayload, tiktokPrivacyLevel: undefined, tiktokPendingPublishId: 'accepted' }))
            .toMatchObject({ errorCode: 'PUBLISH_PENDING', postId: 'tiktok_pending:accepted' });
        expect(publishTikTokVideo).not.toHaveBeenCalled();
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
