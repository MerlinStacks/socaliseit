import { describe, expect, it, vi } from 'vitest';
import { getFacebookPagePosts } from '../posts-sync';
import { metaFetch } from '../meta-fetch';

vi.mock('../meta-fetch', () => ({ metaFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe('Facebook native post aliases', () => {
    it('requests attachment targets and only uses video targets as ID aliases', async () => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({ data: [{
            id: 'page_feed', created_time: '2026-11-17T10:00:00Z', attachments: { data: [
                { media_type: 'video', target: { id: 'video-id' } },
                { media_type: 'link', target: { id: 'unrelated-link' } },
            ] },
        }] }));
        expect(await getFacebookPagePosts('token', 'page')).toMatchObject({ success: true, data: [
            { externalId: 'page_feed', platformIdAliases: ['video-id'] },
        ] });
        expect(metaFetch).toHaveBeenCalledWith('token', expect.stringContaining('attachments{type,media_type,target}'));
    });
});
