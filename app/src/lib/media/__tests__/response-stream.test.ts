import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { responseStream } from '../response-stream';

describe('media response stream', () => {
    it('streams bytes to completion', async () => {
        const response = new Response(responseStream(Readable.from([Buffer.from('video')])));
        expect(await response.text()).toBe('video');
    });

    it('cancels safely while a read is pending', async () => {
        const source = new PassThrough();
        const reader = responseStream(source).getReader();
        const pending = reader.read();
        await Promise.resolve();
        await reader.cancel();
        expect(await pending).toEqual({ done: true, value: undefined });
        expect(source.destroyed).toBe(true);
    });

    it('propagates a source failure to the reader', async () => {
        const source = new PassThrough();
        const reader = responseStream(source).getReader();
        const pending = reader.read();
        source.destroy(new Error('disk read failed'));
        await expect(pending).rejects.toThrow('disk read failed');
    });
});
