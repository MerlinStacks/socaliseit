import { fetchWithTimeout, type FetchWithTimeoutOptions } from './fetch-with-timeout';

/** Bounded retries for reads and explicitly opted-in replayable operations. */
export async function fetchWithRetry(url: string, options: FetchWithTimeoutOptions = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
        options.signal?.throwIfAborted();
        try {
            const response = await fetchWithTimeout(url, options);
            if (attempt === 2 || ![429, 500, 502, 503, 504].includes(response.status)) return response;
            const retryAfter = Number(response.headers.get('retry-after'));
            await response.body?.cancel();
            await new Promise(resolve => setTimeout(resolve,
                Math.min(5000, Math.max(250 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0))));
        } catch (error) {
            if (attempt === 2 || options.signal?.aborted || !(error instanceof Error)
                || !['TimeoutError', 'TypeError'].includes(error.name)) throw error;
            await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
        }
    }
}
