/**
 * String sanitisation helpers for database storage.
 *
 * Why: Prisma's query engine serialises string values as JSON internally.
 * Strings containing malformed hex/unicode escape sequences (e.g. a multi-byte
 * emoji split mid-character by `.slice()`) cause "JSON Error: unexpected end of
 * hex escape" and reject the entire INSERT/UPDATE.
 */

/**
 * Sanitise a string for safe Prisma storage.
 *
 * 1. Strips lone `\x` sequences that are not valid two-digit hex escapes.
 * 2. Truncates to `maxLength` **code-points** (not UTF-16 code units) so
 *    multi-byte characters like emoji are never split mid-sequence.
 * 3. Appends an ellipsis when truncation occurs.
 *
 * @param input     - Raw string (may contain emoji, special Unicode, etc.)
 * @param maxLength - Maximum code-point length (default: no limit)
 */
export function sanitizeForDb(input: string | null | undefined, maxLength?: number): string {
    if (!input) return '';

    // Why: Replace stray \xNN sequences that are NOT valid two-hex-digit
    // escapes. These appear when multi-byte characters are corrupted or when
    // user-generated content includes literal backslash-x patterns.
     
    let sanitized = input.replace(/\\x(?![0-9a-fA-F]{2})/g, '\\\\x');

    // Why: Also strip actual control characters (U+0000–U+001F except \n \r \t)
    // which can cause JSON serialisation issues in some engines.
     
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    if (maxLength && maxLength > 0) {
        // Why: Array.from() iterates by Unicode code-point, not UTF-16 code
        // unit, so emoji (which are 2 code units each) are counted as 1
        // character and never split mid-surrogate-pair.
        const codePoints = Array.from(sanitized);
        if (codePoints.length > maxLength) {
            sanitized = codePoints.slice(0, maxLength).join('') + '...';
        }
    }

    return sanitized;
}
