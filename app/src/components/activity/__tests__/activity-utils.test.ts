import { describe, expect, it } from 'vitest';
import { activityCsv, type ActivityItem } from '../activity-utils';

const item = (overrides: Partial<ActivityItem> = {}): ActivityItem => ({
    id: 'event-1', user: { name: 'Alex' }, action: 'post.created', resourceType: 'post',
    resourceId: 'post-1', resourceName: 'Launch', timestamp: '2 hours ago',
    createdAt: '2026-09-01T12:34:56.789Z', ...overrides,
});
const header = '"Timestamp","User","Action","Resource Type","Resource Name","Details"';

describe('activityCsv', () => {
    it('exports only the header when no events are loaded', () => {
        expect(activityCsv([])).toBe(header);
    });

    it('uses the precise ISO createdAt rather than the relative display timestamp', () => {
        expect(activityCsv([item()])).toBe(`${header}\r\n"2026-09-01T12:34:56.789Z","Alex","post.created","post","Launch",""`);
    });

    it('quotes commas, doubles quotes, and preserves embedded newlines and Unicode', () => {
        expect(activityCsv([item({
            user: { name: 'Alex, "A"' }, resourceName: 'Résumé, "launch"', details: 'Line one\r\nLine "two"\n第三行',
        })])).toBe(`${header}\r\n"2026-09-01T12:34:56.789Z","Alex, ""A""","post.created","post","Résumé, ""launch""","Line one\r\nLine ""two""\n第三行"`);
    });

    it.each(['=SUM(1,2)', '+cmd', '-10', '@SUM(A1)', '  =1+1', '\tformula', '\rformula', '\nformula', ' \t@SUM(A1)'])('neutralizes formula/control prefix %j in every user-controlled column', value => {
        const escaped = `"'${value.replace(/"/g, '""')}"`;
        expect(activityCsv([item({ user: { name: value }, action: value, resourceType: value, resourceName: value, details: value })]))
            .toBe(`${header}\r\n"2026-09-01T12:34:56.789Z",${Array(5).fill(escaped).join(',')}`);
    });

    it('leaves ordinary internal punctuation intact and separates rows with CRLF', () => {
        const csv = activityCsv([item({ resourceName: 'A+B = C @ home - draft', details: null }), item({ id: 'event-2' })]);
        expect(csv.split('\r\n')).toHaveLength(3);
        expect(csv).toContain('"A+B = C @ home - draft",""');
        expect(csv.endsWith('\r\n')).toBe(false);
    });
});
