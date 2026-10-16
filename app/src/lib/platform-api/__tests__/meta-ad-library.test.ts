import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metaFetch } from '../meta-fetch';
import { fetchMetaAdLibraryInsights } from '../meta-ad-library';
import { logger } from '@/lib/logger';

vi.mock('../meta-fetch', () => ({ metaFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('META_AD_LIBRARY_ACCESS_TOKEN', '');
    vi.stubEnv('FACEBOOK_AD_LIBRARY_ACCESS_TOKEN', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('Meta Ad Library availability', () => {
    it('does not request ads without credentials', async () => {
        expect(await fetchMetaAdLibraryInsights(['competitor'])).toMatchObject({ available: false });
        expect(metaFetch).not.toHaveBeenCalled();
    });

    it('prefers explicitly configured eligible credentials over Page credentials', async () => {
        vi.stubEnv('META_AD_LIBRARY_ACCESS_TOKEN', 'dedicated');
        vi.mocked(metaFetch).mockResolvedValue(Response.json({ data: [] }));
        expect(await fetchMetaAdLibraryInsights(['competitor'], 'page')).toMatchObject({ available: true, totalActiveAds: 0 });
        expect(metaFetch).toHaveBeenCalledWith('dedicated', expect.any(String), expect.any(Object));
    });

    it.each([10, 190, 200])('stops a token-wide access failure (%s) and reports unavailable, not zero ads', async code => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({ error: { code, error_subcode: 2332004, message: 'Denied token-secret' } }, { status: 400 }));
        const result = await fetchMetaAdLibraryInsights(['one', 'two', 'three'], 'token-secret');
        expect(result).toMatchObject({ available: false, unavailableReason: expect.stringContaining('access was denied') });
        expect(result.searches).toHaveLength(3);
        expect(metaFetch).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain('token-secret');
        expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('token-secret');
    });

    it('preserves successful empty searches when another term fails', async () => {
        vi.mocked(metaFetch)
            .mockResolvedValueOnce(Response.json({ error: { code: 1, message: 'Temporary failure' } }, { status: 500 }))
            .mockResolvedValueOnce(Response.json({ data: [] }));
        const result = await fetchMetaAdLibraryInsights(['one', 'two'], 'token');
        expect(result.available).toBe(true);
        expect(result.searches[0].error).toBe('Temporary failure');
        expect(result.searches[1].error).toBeUndefined();
    });

    it('treats HTTP failure without a Meta error object as unavailable', async () => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({}, { status: 503 }));
        expect(await fetchMetaAdLibraryInsights(['one'], 'token')).toMatchObject({ available: false });
    });

    it('does not mistake malformed successful responses for zero ads', async () => {
        vi.mocked(metaFetch).mockResolvedValue(Response.json({}));
        expect(await fetchMetaAdLibraryInsights(['one'], 'token')).toMatchObject({ available: false });
    });

    it('redacts token echoes in transport errors', async () => {
        vi.mocked(metaFetch).mockRejectedValue(new Error('Transport failed for token-secret'));
        const result = await fetchMetaAdLibraryInsights(['one'], 'token-secret');
        expect(result.available).toBe(false);
        expect(JSON.stringify(result)).not.toContain('token-secret');
        expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('token-secret');
    });
});
