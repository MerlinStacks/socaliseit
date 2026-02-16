/**
 * Unit tests for the shared Pinterest board fetcher utility.
 *
 * Why: Validates pagination, sorting, error handling, and the 500-board cap
 * without hitting the real Pinterest API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPinterestBoardsDirect } from '@/lib/api/pinterest-boards';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a mock Pinterest board API item. */
function makeBoard(id: string, name: string) {
    return {
        id,
        name,
        description: `Board ${name}`,
        privacy: 'PUBLIC' as const,
        pin_count: 10,
        follower_count: 5,
        media: { image_cover_url: `https://img.pinterest.com/${id}.jpg` },
    };
}

/** Build a successful Pinterest v5 /boards response. */
function boardsResponse(items: ReturnType<typeof makeBoard>[], bookmark?: string) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items, bookmark }),
    };
}

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock the logger so it doesn't try to import pino at test time
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

const fetchSpy = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
    vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('fetchPinterestBoardsDirect', () => {
    it('parses a single page of boards correctly', async () => {
        fetchSpy.mockResolvedValueOnce(
            boardsResponse([makeBoard('1', 'Travel'), makeBoard('2', 'Food')])
        );

        const boards = await fetchPinterestBoardsDirect('test-token');

        expect(boards).toHaveLength(2);
        expect(boards[0].name).toBe('Food');   // sorted alphabetically
        expect(boards[1].name).toBe('Travel');
        expect(boards[0].pinCount).toBe(10);
        expect(boards[0].imageUrl).toContain('pinterest.com');
    });

    it('handles multi-page pagination via bookmark', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                boardsResponse([makeBoard('1', 'Zebra')], 'page2-bookmark')
            )
            .mockResolvedValueOnce(
                boardsResponse([makeBoard('2', 'Apple')])
            );

        const boards = await fetchPinterestBoardsDirect('test-token');

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(boards).toHaveLength(2);
        // Should be sorted: Apple before Zebra
        expect(boards[0].name).toBe('Apple');
        expect(boards[1].name).toBe('Zebra');
    });

    it('caps at 500 boards to prevent unbounded fetching', async () => {
        // Return 250 boards per page with a bookmark each time
        const largePage = Array.from({ length: 250 }, (_, i) =>
            makeBoard(`b${i}`, `Board_${String(i).padStart(3, '0')}`)
        );

        fetchSpy
            .mockResolvedValueOnce(boardsResponse(largePage, 'page2'))
            .mockResolvedValueOnce(boardsResponse(largePage, 'page3'));
        // Third page should never be called because we hit 500

        const boards = await fetchPinterestBoardsDirect('test-token');

        expect(boards).toHaveLength(500);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws on Pinterest API error payload (code + message)', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ code: 429, message: 'Rate limit exceeded' }),
        });

        await expect(fetchPinterestBoardsDirect('test-token'))
            .rejects
            .toThrow('Rate limit exceeded');
    });

    it('throws on non-OK HTTP response (e.g. 502 HTML page)', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            text: () => Promise.resolve('<html>Bad Gateway</html>'),
        });

        await expect(fetchPinterestBoardsDirect('test-token'))
            .rejects
            .toThrow('Pinterest API error 502: Bad Gateway');
    });

    it('returns empty array when no boards exist', async () => {
        fetchSpy.mockResolvedValueOnce(boardsResponse([]));

        const boards = await fetchPinterestBoardsDirect('test-token');

        expect(boards).toHaveLength(0);
    });

    it('sends the correct Authorization header', async () => {
        fetchSpy.mockResolvedValueOnce(boardsResponse([]));

        await fetchPinterestBoardsDirect('my-secret-token');

        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('pinterest.com/v5/boards'),
            expect.objectContaining({
                headers: { Authorization: 'Bearer my-secret-token' },
            })
        );
    });
});
