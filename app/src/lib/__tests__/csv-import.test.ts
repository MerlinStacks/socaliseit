import { describe, expect, it } from 'vitest';
import { exportPostsToCSV, parseCSV } from '../csv-import';

describe('CSV import', () => {
    it('round-trips a multiline caption with escaped quotes and commas as one post', async () => {
        const caption = 'First line, with a comma\n\n"Second line"';
        const csv = await exportPostsToCSV([{ caption, platforms: ['facebook'], status: 'draft' }]);
        expect(parseCSV(csv)).toMatchObject([{ rowNumber: 2, caption, platforms: ['facebook'] }]);
    });

    it('supports a UTF-8 BOM, CRLF, blank rows and physical row numbers', () => {
        const csv = '\uFEFFcaption,platforms\r\n"first\r\nsecond",facebook\r\n\r\nnext,tiktok\r\n';
        expect(parseCSV(csv)).toMatchObject([
            { rowNumber: 2, caption: 'first\r\nsecond', platforms: ['facebook'] },
            { rowNumber: 5, caption: 'next', platforms: ['tiktok'] },
        ]);
    });

    it('rejects an unclosed quoted caption rather than turning its contents into posts', () => {
        expect(() => parseCSV('caption,platforms\n"first\nsecond,facebook')).toThrow('starting on line 2');
    });
});
