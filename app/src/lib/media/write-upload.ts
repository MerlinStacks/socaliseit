import { createWriteStream, type WriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/** Copy an upload without buffering it, and remove failed transfers before returning. */
export async function writeUpload(
    stream: ReadableStream<Uint8Array>,
    filePath: string,
    signal: AbortSignal,
    createDestination: (filePath: string) => WriteStream = createWriteStream,
): Promise<void> {
    const source = Readable.fromWeb(stream as NodeReadableStream<Uint8Array>);
    let destination: WriteStream;
    try {
        destination = createDestination(filePath);
    } catch (error) {
        source.destroy();
        await finished(source, { cleanup: true }).catch(() => {});
        throw error;
    }

    // An abort can reject pipeline before a pending fs.open/write has closed.
    // Wait for close before unlinking so that open cannot recreate the partial file.
    const closed = new Promise<void>((resolve) => destination.once('close', resolve));
    try {
        // fromWeb propagates destruction to the Web stream's cancel(), including
        // while a read is pending. Pipeline owns backpressure and error listeners.
        await pipeline(source, destination, { signal });
    } catch (error) {
        await closed;
        try {
            await unlink(filePath);
        } catch (cleanupError) {
            if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new AggregateError([error, cleanupError], 'Upload transfer and partial-file cleanup failed');
            }
        }
        throw error;
    }
}
