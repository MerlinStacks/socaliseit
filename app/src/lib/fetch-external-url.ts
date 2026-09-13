/** Isolated, bounded GET/HEAD transport for untrusted public URLs. No global fetch changes. */
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { resolveExternalUrl } from '@/lib/validate-url';

export interface ExternalFetchOptions {
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    method?: 'GET' | 'HEAD';
    /** Only non-secret negotiation headers are supported, including across redirects. */
    headers?: Record<string, string>;
}

export interface ExternalResponse {
    url: string;
    ok: boolean;
    status: number;
    headers: Headers;
    body: Buffer;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
}

export async function fetchExternalUrl(value: string, options: ExternalFetchOptions = {}): Promise<ExternalResponse> {
    const { maxBytes = 10 * 1024 * 1024, timeoutMs = 15_000, maxRedirects = 5, method = 'GET' } = options;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1 ||
        !Number.isSafeInteger(maxRedirects) || maxRedirects < 0) throw new Error('Invalid external fetch limits');
    const headers: Record<string, string> = { 'accept-encoding': 'identity' };
    for (const [name, value] of Object.entries(options.headers || {})) {
        if (!['accept', 'user-agent', 'accept-language'].includes(name.toLowerCase())) throw new Error(`Unsupported external request header: ${name}`);
        headers[name.toLowerCase()] = value;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('External fetch timed out')), timeoutMs);
    const { signal } = controller;
    // DNS cannot be cancelled via lookup; racing it ensures the deadline returns promptly.
    // The signal check after resolution prevents a late lookup from opening a socket.
    const work = async (): Promise<ExternalResponse> => {
        let current = value;
        for (let hop = 0; ; hop++) {
            const target = await resolveExternalUrl(current);
            signal.throwIfAborted();
            const result = await new Promise<ExternalResponse | string>((resolve, reject) => {
                const transport = target.url.protocol === 'https:' ? https : http;
                // Keep the original hostname for Host, SNI and certificate verification.
                // A fresh agent-less socket uses ONLY the vetted address, including all:true lookups.
                const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
                    if (lookupOptions.all) callback(null, [{ address: target.address, family: target.family }]);
                    else callback(null, target.address, target.family);
                };
                const request = transport.request(target.url, { method, headers, agent: false, lookup, signal }, (response) => {
                    response.on('error', reject);
                    const status = response.statusCode || 0;
                    if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
                        response.destroy();
                        if (hop >= maxRedirects) return reject(new Error('Too many redirects'));
                        try { resolve(new URL(response.headers.location, target.url).href); } catch (error) { reject(error); }
                        return;
                    }
                    const fail = (message: string) => { reject(new Error(message)); response.destroy(); };
                    // No transparent decompression: compressed bodies are rejected, avoiding zip bombs.
                    if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
                        fail('Compressed external responses are not supported'); return;
                    }
                    if (method !== 'HEAD' && Number(response.headers['content-length']) > maxBytes) {
                        fail('Response too large'); return;
                    }
                    let size = 0;
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > maxBytes) { fail('Response too large'); return; }
                        chunks.push(chunk);
                    });
                    response.on('aborted', () => reject(new Error('External response aborted')));
                    response.on('end', () => {
                        const body = Buffer.concat(chunks, size);
                        const responseHeaders = new Headers();
                        for (const [name, value] of Object.entries(response.headers)) {
                            if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
                        }
                        resolve({ url: target.url.href, status, ok: status >= 200 && status < 300,
                            headers: responseHeaders, body, text: async () => body.toString('utf8'),
                            arrayBuffer: async () => Uint8Array.from(body).buffer });
                    });
                });
                request.on('error', reject);
                request.end();
            });
            if (typeof result !== 'string') return result;
            current = result;
        }
    };
    let onAbort: () => void = () => {};
    try {
        return await Promise.race([work(), new Promise<never>((_, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
        })]);
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
    }
}
