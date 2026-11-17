import { describe, expect, it } from 'vitest';
import { readApiError } from './api-response-error';

describe('readApiError', () => {
    it.each([
        [{ message: 'Slug already exists', error: 'Conflict' }, 'Slug already exists'],
        [{ error: 'Validation Error', details: { fieldErrors: { name: ['Required'], color: ['Invalid color'] } } }, 'name: Required; color: Invalid color'],
        [{ details: { formErrors: ['Invalid request'] } }, 'Invalid request'],
        [{ error: 'Forbidden' }, 'Forbidden'],
        [null, 'Fallback'],
        [{ error: { unexpected: true } }, 'Fallback'],
    ])('reads actionable errors from %j', async (body, expected) => {
        expect(await readApiError(new Response(JSON.stringify(body)), 'Fallback')).toBe(expected);
    });

    it('handles non-JSON responses', async () => {
        expect(await readApiError(new Response('<html>Bad gateway</html>'), 'Fallback')).toBe('Fallback');
    });
});
