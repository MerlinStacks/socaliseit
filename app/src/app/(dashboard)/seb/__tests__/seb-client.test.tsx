import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The page keeps its own shape by reading the source rather than rendering it: the
 * workspace tests already mount this component with the drawer, and what must not come
 * back is a second conversation living inside the page. A second chat controller would
 * silently fork the thread the drawer is holding.
 */
const source = readFileSync(`${process.cwd()}/src/app/(dashboard)/seb/seb-client.tsx`, 'utf8');

describe('the workspace page after the drawer took the chat', () => {
    it('keeps the conversation out of the page', () => {
        expect(source).not.toMatch(/from "[^"]*use-seb-chat"/);
        expect(source).not.toContain('<ChatPanel');
        expect(source).not.toMatch(/useSebChat\(/);
        expect(source).toContain('useSebChatSurface');
    });

    it('still says what is discussable while it is on screen', () => {
        expect(source).toContain('useSebDiscussions');
        expect(source).toContain('workspaceDiscussions');
    });

    it('hands a deep link to the drawer instead of opening a panel of its own', () => {
        expect(source).toMatch(/openChat\(/);
        expect(source).not.toContain('seb-chat-panel');
    });
});
