/**
 * Pinterest Board Fetcher (Shared Utility)
 *
 * Why: Both the API route and the commerce module need paginated board
 * fetching. Centralising here avoids a second, un-paginated copy that
 * silently drops boards for large accounts.
 *
 * Uses Pinterest API v5 `/boards` with bookmark-based pagination,
 * capped at 500 boards.
 */

import { logger } from '@/lib/logger';
import { PINTEREST_API_URL } from '@/lib/platform-api/constants';

/** Shape returned by Pinterest v5 `/boards`. */
interface PinterestApiBoardItem {
    id: string;
    name: string;
    description?: string;
    privacy: 'PUBLIC' | 'SECRET' | 'PROTECTED';
    pin_count?: number;
    follower_count?: number;
    media?: {
        image_cover_url?: string;
    };
}

interface PinterestBoardsApiResponse {
    items?: PinterestApiBoardItem[];
    bookmark?: string;
    /** Pinterest error responses include `code` + `message`. */
    code?: number;
    message?: string;
}

/** Cleaned board shape used across the app. */
export interface PinterestBoard {
    id: string;
    name: string;
    description?: string;
    privacy: 'PUBLIC' | 'SECRET' | 'PROTECTED';
    pinCount?: number;
    followerCount?: number;
    imageUrl?: string;
}
const MAX_BOARDS = 500;
const PAGE_SIZE = 100;

/**
 * Fetch all boards for a Pinterest account via v5 API with pagination.
 *
 * Why: Pinterest paginates via `bookmark`; a single page only returns
 * up to 25 items by default. Without pagination, large accounts would
 * silently lose boards in the selector.
 *
 * @throws {Error} On Pinterest API errors or non-JSON responses.
 */
export async function fetchPinterestBoardsDirect(
    accessToken: string
): Promise<PinterestBoard[]> {
    const boards: PinterestBoard[] = [];
    let bookmark: string | undefined;

    do {
        const url = new URL(`${PINTEREST_API_URL}/boards`);
        url.searchParams.set('page_size', String(PAGE_SIZE));
        if (bookmark) {
            url.searchParams.set('bookmark', bookmark);
        }

        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Guard against non-JSON error pages (e.g. 502 HTML from a proxy)
        if (!response.ok) {
            const text = await response.text().catch(() => '(unreadable body)');
            logger.error(
                { status: response.status, statusText: response.statusText, body: text.slice(0, 500) },
                'Pinterest boards API returned non-OK response'
            );
            throw new Error(
                `Pinterest API error ${response.status}: ${response.statusText}`
            );
        }

        const data: PinterestBoardsApiResponse = await response.json();

        if (data.code && data.message) {
            logger.error(
                { code: data.code, message: data.message },
                'Pinterest boards API returned an error payload'
            );
            throw new Error(data.message);
        }

        if (data.items) {
            boards.push(
                ...data.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    description: item.description || undefined,
                    privacy: item.privacy,
                    pinCount: item.pin_count,
                    followerCount: item.follower_count,
                    imageUrl: item.media?.image_cover_url,
                }))
            );
        }

        bookmark = data.bookmark;
    } while (bookmark && boards.length < MAX_BOARDS);

    // Alphabetical sort for deterministic UX
    boards.sort((a, b) => a.name.localeCompare(b.name));

    return boards;
}
