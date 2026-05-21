import { platformFetch, type FetchWithTimeoutOptions } from '@/lib/fetch-with-timeout';

export async function metaFetch(
    accessToken: string,
    url: string,
    options: FetchWithTimeoutOptions = {},
): Promise<Response> {
    return platformFetch('meta', 'graphApi', url, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
        },
    });
}

export async function metaJson<T = any>(accessToken: string, url: string): Promise<T> {
    const response = await metaFetch(accessToken, url);
    return response.json() as Promise<T>;
}
