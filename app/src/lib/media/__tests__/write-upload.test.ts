// @vitest-environment node
import { close, createWriteStream, open, write, type WriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeUpload } from '../write-upload';

describe('writeUpload', () => {
    let directory: string;
    let filePath: string;
    let destination: WriteStream;
    let abort: AbortController;

    beforeEach(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'write-upload-'));
        filePath = path.join(directory, 'upload.bin');
        abort = new AbortController();
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    function createDestination(target: string) {
        destination = createWriteStream(target, { highWaterMark: 1 });
        return destination;
    }

    async function expectCleanedUp() {
        expect(destination.destroyed).toBe(true);
        expect(destination.closed).toBe(true);
        await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    }

    it('copies a real File byte-for-byte through backpressure and closes the destination', async () => {
        const bytes = Buffer.alloc(256 * 1024, 123);
        const file = new File([bytes, 'last chunk'], 'upload.bin');
        await writeUpload(file.stream(), filePath, abort.signal, createDestination);

        expect(await readFile(filePath)).toEqual(Buffer.concat([bytes, Buffer.from('last chunk')]));
        expect(destination.writableFinished).toBe(true);
        expect(destination.closed).toBe(true);
        abort.abort();
        expect(await readFile(filePath)).toHaveLength(bytes.length + 10);
    });

    it('rejects a source error after writing data and removes the partial file', async () => {
        const failure = new Error('source failed');
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const source = new ReadableStream<Uint8Array>({
            start(value) {
                controller = value;
                controller.enqueue(new Uint8Array([1, 2, 3]));
            },
        });
        await expect(writeUpload(source, filePath, abort.signal, (target) => {
            const output = createDestination(target);
            output.once('drain', () => controller.error(failure));
            return output;
        })).rejects.toBe(failure);
        await expectCleanedUp();
    });

    it('handles a writable error while backpressured, cancels the source, and cleans up', async () => {
        const failure = new Error('disk full');
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array(64 * 1024)); },
            cancel,
        });
        let backpressured = false;
        await expect(writeUpload(source, filePath, abort.signal, (target) => {
            const output = createDestination(target);
            // A real fs stream, with an asynchronous disk-write failure while
            // write() is returning false (the old loop would wait forever).
            output._write = (_chunk, _encoding, callback) => {
                setImmediate(() => {
                    backpressured = output.writableNeedDrain;
                    callback(failure);
                });
            };
            return output;
        })).rejects.toBe(failure);
        expect(backpressured).toBe(true);
        expect(cancel).toHaveBeenCalledOnce();
        await expectCleanedUp();
    });

    it('handles destination open failure and cancels a pending source', async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({ cancel });
        filePath = path.join(directory, 'missing', 'upload.bin');
        await expect(writeUpload(source, filePath, abort.signal, createDestination))
            .rejects.toMatchObject({ code: 'ENOENT' });
        expect(cancel).toHaveBeenCalledOnce();
        await expectCleanedUp();
    });

    it('cancels a pre-aborted transfer and cleans up even with fs.open pending', async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({ cancel });
        abort.abort();
        await expect(writeUpload(source, filePath, abort.signal, createDestination))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(cancel).toHaveBeenCalledOnce();
        await expectCleanedUp();
    });

    it('aborts after a partial write while the next source read is pending', async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
            cancel,
        });
        await expect(writeUpload(source, filePath, abort.signal, (target) => {
            const output = createDestination(target);
            output.once('drain', () => abort.abort());
            return output;
        })).rejects.toMatchObject({ name: 'AbortError' });
        expect(cancel).toHaveBeenCalledOnce();
        await expectCleanedUp();
    });

    it('aborts under write backpressure and waits for the pending write to close', async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array(64 * 1024)); },
            cancel,
        });
        let backpressured = false;
        await expect(writeUpload(source, filePath, abort.signal, (target) => {
            destination = createWriteStream(target, {
                highWaterMark: 1,
                fs: {
                    open,
                    close,
                    write(fd, buffer, offset, length, position, callback) {
                        setImmediate(() => {
                            backpressured = destination.writableNeedDrain;
                            abort.abort();
                            write(fd, buffer, offset, length, position, callback);
                        });
                    },
                },
            });
            return destination;
        })).rejects.toMatchObject({ name: 'AbortError' });
        expect(backpressured).toBe(true);
        expect(cancel).toHaveBeenCalledOnce();
        await expectCleanedUp();
    });
});
