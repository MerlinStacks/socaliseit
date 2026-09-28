import type { Readable } from 'node:stream';

/** Pull-based bridge: cancellation may finish while an asynchronous read is pending. */
export function responseStream(source: Readable): ReadableStream<Uint8Array> {
    const iterator = source[Symbol.asyncIterator]();
    let closed = false;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const chunk = await iterator.next();
                if (closed) return;
                if (chunk.done) {
                    closed = true;
                    controller.close();
                } else {
                    controller.enqueue(chunk.value);
                }
            } catch (error) {
                if (closed) return;
                closed = true;
                controller.error(error);
                source.destroy();
            }
        },
        cancel() {
            closed = true;
            source.destroy();
        },
    });
}
