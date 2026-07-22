export interface ByteRange {
    start: number;
    end: number;
}

/** Parse a single HTTP byte range. Multiple ranges are not supported. */
export function parseByteRange(rangeHeader: string, fileSize: number): ByteRange | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match || fileSize <= 0) return null;

    const [, startValue, endValue] = match;
    if (!startValue && !endValue) return null;

    if (!startValue) {
        const suffixLength = Number(endValue);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;

        return {
            start: Math.max(fileSize - suffixLength, 0),
            end: fileSize - 1,
        };
    }

    const start = Number(startValue);
    const requestedEnd = endValue ? Number(endValue) : fileSize - 1;
    if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(requestedEnd)
        || start < 0
        || start >= fileSize
        || requestedEnd < start
    ) {
        return null;
    }

    return { start, end: Math.min(requestedEnd, fileSize - 1) };
}
