import { describe, expect, it } from 'vitest';

import { needsTranscoding, type VideoMetadata } from '@/lib/services/video-transcode';

const compatibleVideo: VideoMetadata = {
    width: 1920,
    height: 1080,
    duration: 60,
    size: 50 * 1024 * 1024,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    fps: 30,
};

describe('needsTranscoding', () => {
    it('accepts broadly compatible H.264 video', () => {
        expect(needsTranscoding(compatibleVideo, 'UPLOAD_GENERIC')).toBe(false);
    });

    it('transcodes 10-bit H.264 video', () => {
        expect(needsTranscoding(
            { ...compatibleVideo, pixelFormat: 'yuv420p10le' },
            'UPLOAD_GENERIC',
        )).toBe(true);
    });

    it('transcodes MP4 video with unsupported audio', () => {
        expect(needsTranscoding(
            { ...compatibleVideo, audioCodec: 'pcm_s24le' },
            'UPLOAD_GENERIC',
        )).toBe(true);
    });

    it('allows videos without an audio stream', () => {
        expect(needsTranscoding(
            { ...compatibleVideo, audioCodec: null },
            'UPLOAD_GENERIC',
        )).toBe(false);
    });
});
