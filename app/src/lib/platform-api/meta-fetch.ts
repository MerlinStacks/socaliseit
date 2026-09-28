import { platformFetch, type FetchWithTimeoutOptions } from '@/lib/fetch-with-timeout';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

export async function metaFetch(
    accessToken: string,
    url: string,
    options: FetchWithTimeoutOptions = {},
): Promise<Response> {
    const request = {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
        },
    };
    return (options.method || 'GET').toUpperCase() === 'GET'
        ? fetchWithRetry(url, { ...request, logContext: { platform: 'meta', operation: 'graphApi' } })
        : platformFetch('meta', 'graphApi', url, request);
}

export async function metaJson<T = any>(accessToken: string, url: string): Promise<T> {
    const response = await metaFetch(accessToken, url);
    return response.json() as Promise<T>;
}
