import { randomUUID } from 'crypto';
import type { SubtitleTrack } from '@/lib/publishing-metadata';
import { YOUTUBE_DATA_API_URL } from './constants';

/** Run only after a confirmed upload. An enhancement failure must never re-upload the video. */
export async function applyYouTubeEnhancements(accessToken: string, videoId: string, options: {
    subtitleTracks?: SubtitleTrack[];
    playlistId?: string;
    createFirstLike?: boolean;
}): Promise<string[]> {
    const warnings: string[] = [];
    const request = async (label: string, url: string, init: RequestInit) => {
        try {
            const response = await fetch(url, {
                ...init,
                headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch {
            warnings.push(`${label} could not be applied. The video is uploaded; complete this in YouTube Studio. Reconnect YouTube if permissions are missing.`);
        }
    };

    for (const track of options.subtitleTracks || []) {
        const boundary = `socialiseit_${randomUUID()}`;
        const metadata = { snippet: { videoId, language: track.language, name: track.name, isDraft: false } };
        const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
            + `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${track.text}\r\n--${boundary}--\r\n`;
        await request(`Subtitles (${track.language}, ${track.name})`, 'https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', {
            method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
        });
    }

    if (options.playlistId) {
        await request('Playlist selection', `${YOUTUBE_DATA_API_URL}/playlistItems?part=snippet`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snippet: { playlistId: options.playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
        });
    }
    if (options.createFirstLike) {
        await request('First like', `${YOUTUBE_DATA_API_URL}/videos/rate?${new URLSearchParams({ id: videoId, rating: 'like' })}`, { method: 'POST' });
    }
    return warnings;
}
