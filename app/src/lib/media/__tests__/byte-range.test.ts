import { describe, expect, it } from 'vitest';

import { parseByteRange } from '@/lib/media/byte-range';

describe('parseByteRange', () => {
    it('parses a bounded range', () => {
        expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    });

    it('clamps an open-ended range to the file size', () => {
        expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
        expect(parseByteRange('bytes=90-200', 100)).toEqual({ start: 90, end: 99 });
    });

    it('parses suffix ranges', () => {
        expect(parseByteRange('bytes=-20', 100)).toEqual({ start: 80, end: 99 });
        expect(parseByteRange('bytes=-200', 100)).toEqual({ start: 0, end: 99 });
    });

    it('rejects malformed or unsatisfiable ranges', () => {
        expect(parseByteRange('bytes=100-', 100)).toBeNull();
        expect(parseByteRange('bytes=20-10', 100)).toBeNull();
        expect(parseByteRange('bytes=0-1,4-5', 100)).toBeNull();
        expect(parseByteRange('items=0-10', 100)).toBeNull();
        expect(parseByteRange('bytes=-0', 100)).toBeNull();
    });
});
