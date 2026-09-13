import { describe, expect, it } from 'vitest';
import { inboxKey, inboxParams, legacyInboxType, safeInboxUrl, workflowTarget, type InboxItem } from './inbox-model';

describe('inbox frontend contracts', () => {
    const item = { id: 'message-1', type: 'dm', socialAccountId: 'account-1', meta: { conversationId: 'thread-1' } } as InboxItem;

    it('keeps DM selection stable when the latest message changes', () => {
        expect(inboxKey(item)).toBe(inboxKey({ ...item, id: 'message-2' }));
        expect(inboxKey(item)).not.toBe(inboxKey({ ...item, socialAccountId: 'account-2' }));
    });

    it('sends the local row and account identity to workflow mutations', () => {
        expect(workflowTarget(item)).toEqual({ id: 'message-1', type: 'dm', socialAccountId: 'account-1' });
    });

    it('maps legacy links without accepting inherited object properties', () => {
        expect(legacyInboxType('messages')).toBe('dm');
        expect(legacyInboxType('reviews')).toBe('review');
        expect(legacyInboxType('constructor')).toBe('all');
        expect(legacyInboxType(null)).toBe('all');
    });

    it('forwards search and workflow filters with URL encoding', () => {
        const params = new URLSearchParams(inboxParams({ type: 'review', queue: 'mine', q: 'hello & goodbye', socialAccountId: 'account-1', platform: '', sentiment: 'negative' }, 2));
        expect(Object.fromEntries(params)).toEqual({ type: 'review', queue: 'mine', page: '2', q: 'hello & goodbye', socialAccountId: 'account-1', sentiment: 'negative' });
    });

    it('only allows absolute web links in platform content', () => {
        expect(safeInboxUrl('https://example.com/post')).toBe('https://example.com/post');
        for (const value of ['javascript:alert(1)', 'data:text/html,test', '/relative', null]) expect(safeInboxUrl(value)).toBeUndefined();
    });
});
