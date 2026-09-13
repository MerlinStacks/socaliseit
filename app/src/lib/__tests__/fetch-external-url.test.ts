// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fetchExternalUrl } from '../fetch-external-url';

type Reply = { status?: number; headers?: Record<string, string>; chunks?: string[]; stall?: boolean };
let replies: Reply[];
let responses: PassThrough[];
let calls: { url: URL; options: http.RequestOptions }[];

beforeEach(() => {
    replies = []; responses = []; calls = [];
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    const request = (url: URL, options: http.RequestOptions, cb: (response: http.IncomingMessage) => void) => {
        calls.push({ url, options });
        const req = new EventEmitter() as http.ClientRequest;
        req.end = (() => {
            queueMicrotask(() => {
                const reply = replies.shift() || {};
                const stream = Object.assign(new PassThrough(), { statusCode: reply.status || 200, headers: reply.headers || {} });
                responses.push(stream);
                const abort = () => { stream.destroy(new Error('aborted')); req.emit('error', new Error('aborted')); };
                options.signal?.addEventListener('abort', abort, { once: true });
                stream.on('close', () => options.signal?.removeEventListener('abort', abort));
                cb(stream as unknown as http.IncomingMessage);
                for (const chunk of reply.chunks || []) { if (!stream.destroyed) stream.write(chunk); }
                if (!reply.stall && !stream.destroyed) stream.end();
            });
            return req;
        }) as http.ClientRequest['end'];
        return req;
    };
    vi.spyOn(http, 'request').mockImplementation(request as typeof http.request);
    vi.spyOn(https, 'request').mockImplementation(request as typeof https.request);
});
afterEach(() => { responses.forEach((r) => r.destroy()); vi.restoreAllMocks(); });

describe('pinned external transport', () => {
    it('uses vetted DNS in the socket lookup, preserving HTTPS hostname and disabling pooling', async () => {
        replies.push({ chunks: ['hello'] });
        const response = await fetchExternalUrl('https://example.com/path');
        vi.mocked(dns.lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
        const { url, options } = calls[0];
        expect(url.hostname).toBe('example.com');
        expect(options.agent).toBe(false);
        const cb = vi.fn();
        options.lookup!('example.com', {}, cb);
        expect(cb).toHaveBeenCalledWith(null, '8.8.8.8', 4);
        options.lookup!('example.com', { all: true }, cb);
        expect(cb).toHaveBeenLastCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
        expect(dns.lookup).toHaveBeenCalledTimes(1);
        expect(await response.text()).toBe('hello');
    });
    it.each(['http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'file:///etc/passwd', 'https://user:pass@example.com/'])
        ('rejects redirect to %s before connecting', async (location) => {
            replies.push({ status: 302, headers: { location }, stall: true });
            await expect(fetchExternalUrl('https://example.com')).rejects.toThrow();
            expect(calls).toHaveLength(1);
            expect(responses[0].destroyed).toBe(true);
        });
    it('revalidates even same-host redirects against rebinding', async () => {
        vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as never)
            .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as never);
        replies.push({ status: 307, headers: { location: '/next' } });
        await expect(fetchExternalUrl('https://example.com')).rejects.toThrow('nonpublic');
        expect(calls).toHaveLength(1);
    });
    it('resolves relative redirects and limits loops', async () => {
        replies.push({ status: 302, headers: { location: '../end' } }, { chunks: ['done'] });
        expect((await fetchExternalUrl('https://example.com/a/start')).url).toBe('https://example.com/end');
        replies.push({ status: 302, headers: { location: '/' } }, { status: 302, headers: { location: '/' } });
        await expect(fetchExternalUrl('https://example.com', { maxRedirects: 1 })).rejects.toThrow('Too many redirects');
    });
    it.each<Record<string, string>>([{}, { 'content-length': '2' }, { 'transfer-encoding': 'chunked' }])
        ('bounds actual streamed bytes regardless of headers %j', async (headers) => {
            replies.push({ headers, chunks: ['123', '456'], stall: true });
            await expect(fetchExternalUrl('http://example.com', { maxBytes: 5 })).rejects.toThrow('too large');
            expect(responses[0].destroyed).toBe(true);
        });
    it('rejects oversized declared bodies and compressed responses before reading', async () => {
        replies.push({ headers: { 'content-length': '999999' }, stall: true });
        await expect(fetchExternalUrl('http://example.com', { maxBytes: 5 })).rejects.toThrow('too large');
        replies.push({ headers: { 'content-encoding': 'gzip' }, stall: true });
        await expect(fetchExternalUrl('http://example.com')).rejects.toThrow('Compressed');
        expect(responses.every((r) => r.destroyed)).toBe(true);
    });
    it('times out a stalled body and destroys its connection', async () => {
        replies.push({ chunks: ['x'], stall: true });
        await expect(fetchExternalUrl('http://example.com', { timeoutMs: 20 })).rejects.toThrow();
        expect(responses[0].destroyed).toBe(true);
    });
    it('times out DNS and prevents a late result from connecting', async () => {
        let finish!: (value: never) => void;
        vi.mocked(dns.lookup).mockImplementation(() => new Promise((resolve) => { finish = resolve; }) as never);
        await expect(fetchExternalUrl('http://example.com', { timeoutMs: 20 })).rejects.toThrow('timed out');
        finish([{ address: '8.8.8.8', family: 4 }] as never);
        await new Promise((resolve) => setImmediate(resolve));
        expect(calls).toHaveLength(0);
    });
    it('rejects secret and Host override headers', async () => {
        await expect(fetchExternalUrl('http://example.com', { headers: { Host: 'localhost' } })).rejects.toThrow('Unsupported');
        await expect(fetchExternalUrl('http://example.com', { headers: { Authorization: 'secret' } })).rejects.toThrow('Unsupported');
        expect(calls).toHaveLength(0);
    });
});
