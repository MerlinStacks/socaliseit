/** Retry media-transfer 5xx responses as required by TikTok's transfer guide. */
import { logger } from '@/lib/logger';

const CHUNK_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

export async function uploadTikTokChunk(
    uploadUrl: string,
    request: RequestInit,
    context: { publishId: string; chunk: number },
): Promise<Response> {
    // One budget across requests and backoff, rather than a new two minutes per attempt.
    const signal = AbortSignal.timeout(CHUNK_TIMEOUT_MS);
    const deadline = Date.now() + CHUNK_TIMEOUT_MS;
    for (let attempt = 1; ; attempt++) {
        // Transport errors remain uncertain; only explicit 5xx responses are retried.
        const response = await fetch(uploadUrl, { ...request, signal });
        if (response.status < 500 || response.status > 599 || attempt === MAX_ATTEMPTS) return response;

        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
        const retryAt = retryAfter ? Date.parse(retryAfter) : NaN;
        const serverDelay = seconds !== undefined ? seconds * 1000
            : Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
        const delayMs = Math.max(2_000 * 2 ** (attempt - 1), serverDelay);
        if (Date.now() + delayMs >= deadline) return response;

        logger.warn({ ...context, status: response.status, attempt, maxAttempts: MAX_ATTEMPTS, delayMs },
            '[TikTok API] Temporary upload error; retrying same chunk');
        // Release the failed response before reusing the connection. Never log signed upload URLs.
        await response.body?.cancel();
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
        signal.throwIfAborted();
    }
}
