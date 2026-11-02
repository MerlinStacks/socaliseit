// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    completion: vi.fn(), plain: vi.fn(), settings: vi.fn(), context: vi.fn(), model: vi.fn(),
    runTool: vi.fn(), available: vi.fn(), allowed: vi.fn(), definitions: vi.fn(), attachments: vi.fn(),
    permissions: vi.fn(), session: vi.fn(), sessionUpdate: vi.fn(), messageFind: vi.fn(), messageCreate: vi.fn(), user: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: {
    sebChatSession: { findFirst: mocks.session, create: mocks.session, update: mocks.sessionUpdate },
    sebChatMessage: { findMany: mocks.messageFind, create: mocks.messageCreate },
    user: { findUnique: mocks.user },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/auth/with-permission', () => ({ getMemberPermissions: mocks.permissions }));
vi.mock('../openrouter-models', () => ({ getSebModel: mocks.model }));
vi.mock('../seb-transport', () => ({ requestSebCompletion: mocks.completion }));
vi.mock('../seb-advisor', () => ({
    getSebSettings: mocks.settings, collectContext: mocks.context,
    callOpenRouter: mocks.plain, normalizeSebChatAnswer: (text: string) => text.trim(),
}));
// The tools themselves are tested where they are defined; here it is the loop that matters.
vi.mock('../seb-tools', () => ({
    availableSebTools: mocks.available, allowedToolNames: mocks.allowed,
    sebToolDefinitions: mocks.definitions, runSebTool: mocks.runTool,
    findSebChatMediaAttachments: mocks.attachments,
}));

import { SebProviderError } from '../seb-provider-error';
import { chatWithSeb } from '../seb-agent';

const assistant = (content: string) => ({ choices: [{ message: { content } }] });
const calling = (name: string, args: Record<string, unknown>, id = 'call-1') => ({
    choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});
const savedMessage = () => mocks.messageCreate.mock.calls.at(-1)?.[0].data as { content: string; metadata: Record<string, any> };
const sentMessages = (call: number) => mocks.completion.mock.calls[call]?.[1] as Record<string, unknown>[];

beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({ apiKey: 'key', model: 'test/model', temperature: .7, systemPrompt: 'You are Seb.' });
    mocks.context.mockResolvedValue({ timezone: 'Europe/London', accounts: [] });
    mocks.model.mockResolvedValue({ supportsTools: true, supportsImageInput: true });
    mocks.permissions.mockResolvedValue(['media.view', 'posts.create']);
    mocks.session.mockResolvedValue({ id: 'session-1' });
    mocks.sessionUpdate.mockResolvedValue({});
    mocks.messageFind.mockResolvedValue([]);
    mocks.messageCreate.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'message-1', ...args.data }));
    mocks.user.mockResolvedValue({ name: 'Ada', email: 'ada@example.com' });
    mocks.available.mockReturnValue([{ name: 'search_media' }, { name: 'draft_post' }]);
    mocks.allowed.mockReturnValue(new Set(['search_media', 'draft_post']));
    mocks.definitions.mockReturnValue([{ type: 'function', function: { name: 'search_media' } }]);
    mocks.attachments.mockResolvedValue([]);
    mocks.plain.mockResolvedValue('A plain answer.');
});

describe('a chat that can act', () => {
    it('runs the tool, tells the model the result, and keeps what it produced', async () => {
        mocks.completion
            .mockResolvedValueOnce(calling('search_media', { query: 'launch' }))
            .mockResolvedValueOnce(assistant('I found your launch reel.'));
        mocks.runTool.mockResolvedValue({
            content: { count: 1, media: [{ mediaId: 'm1' }] },
            artifacts: [{ kind: 'media', id: 'media:m1', title: 'launch-reel.mp4', items: [] }],
            trace: { name: 'search_media', label: 'Searched your media library for “launch”', ok: true },
        });

        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'What have I got for the launch?' });

        expect(mocks.completion.mock.calls[0][5]).toMatchObject({ tools: [{ type: 'function' }] });
        // The assistant's own tool call must be replayed before its result, or the provider rejects the turn.
        expect(sentMessages(1)[3]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'search_media' } }] });
        expect(sentMessages(1)[4]).toMatchObject({ role: 'tool', tool_call_id: 'call-1', name: 'search_media' });
        expect(reply.message.content).toBe('I found your launch reel.');
        expect(savedMessage().metadata).toMatchObject({
            artifacts: [{ kind: 'media', id: 'media:m1' }],
            tools: [{ name: 'search_media', ok: true, label: 'Searched your media library for “launch”' }],
        });
    });

    it('says what it did in the same words the trace uses', async () => {
        mocks.completion.mockResolvedValueOnce(calling('draft_post', { caption: 'Hi', accountIds: ['a1'] }))
            .mockResolvedValueOnce(assistant('Drafted for Instagram.'));
        mocks.runTool.mockResolvedValue({ content: { created: 1 }, artifacts: [{ kind: 'posts', id: 'draft:p1', title: 'Drafted from chat', posts: [], write: true }], trace: { name: 'draft_post', label: 'Drafted a post', ok: true } });

        await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Draft something.' });

        expect(savedMessage().metadata.artifacts[0]).toMatchObject({ kind: 'posts', write: true });
    });

    it('stops inventing previews once a tool has shown the library', async () => {
        mocks.completion.mockResolvedValueOnce(calling('search_media', {})).mockResolvedValueOnce(assistant('There they are.'));
        mocks.runTool.mockResolvedValue({ content: { count: 2 }, artifacts: [{ kind: 'media', id: 'media:x', title: 'From your media library', items: [] }], trace: { name: 'search_media', label: 'Searched your media library', ok: true } });

        await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Show me the photos.' });

        expect(mocks.attachments).not.toHaveBeenCalled();
    });

    it('lets the keyword guess stand when no tool looked at media', async () => {
        mocks.completion.mockResolvedValue(assistant('Use the launch reel.'));
        mocks.attachments.mockResolvedValue([{ id: 'm9', title: 'launch-reel.mp4', type: 'video', mimeType: 'video/mp4', url: 'u', previewUrl: 'u', rationale: 'Mentioned in your answer' }]);

        await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Which video fits?' });

        expect(mocks.attachments).toHaveBeenCalledWith('org-1', 'Which video fits?', 'Use the launch reel.');
        expect(savedMessage().metadata.attachments).toHaveLength(1);
    });
});

describe('when the loop will not settle', () => {
    it('asks once more with no tools rather than stopping mid-task', async () => {
        mocks.completion.mockImplementation(async () => calling('search_media', {}, 'loop'));
        mocks.runTool.mockResolvedValue({ content: { count: 0 }, artifacts: [], trace: { name: 'search_media', label: 'Searched your media library', ok: true } });

        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Search again.' });

        // Four tool rounds, then one request that cannot call anything.
        expect(mocks.completion).toHaveBeenCalledTimes(5);
        expect(mocks.completion.mock.calls[4][5]).toEqual({ timeoutMs: expect.any(Number) });
        // It called tools even then, so the ordinary no-tools answer keeps its promise.
        expect(reply.message.content).toBe('A plain answer.');
        expect(savedMessage().metadata.tools).toHaveLength(4);
    });

    it('keeps the record of what already ran when the provider dies mid-turn', async () => {
        mocks.completion.mockResolvedValueOnce(calling('draft_post', { caption: 'Hi', accountIds: ['a1'] }));
        mocks.runTool.mockResolvedValue({ content: { created: 1 }, artifacts: [{ kind: 'posts', id: 'draft:p1', title: 'Drafted from chat', posts: [], write: true }], trace: { name: 'draft_post', label: 'Drafted a post', ok: true } });
        mocks.completion.mockRejectedValueOnce(new SebProviderError('TIMEOUT'));

        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Draft and schedule it.' });

        expect(reply.message.content).toContain('cut off');
        expect(savedMessage().metadata.tools).toEqual([{ name: 'draft_post', label: 'Drafted a post', ok: true }]);
    });

    it('still throws when nothing ran and the provider is simply down', async () => {
        mocks.completion.mockRejectedValue(new SebProviderError('RATE_LIMIT'));
        await expect(chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Hello' })).rejects.toBeInstanceOf(SebProviderError);
    });
});

describe('a chat with no tools', () => {
    it('answers from context when the model cannot call tools', async () => {
        mocks.model.mockResolvedValue({ supportsTools: false, supportsImageInput: false });
        mocks.available.mockReturnValue([]);
        mocks.allowed.mockReturnValue(new Set());
        mocks.definitions.mockReturnValue([]);

        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Hello' });

        expect(mocks.completion).not.toHaveBeenCalled();
        expect(mocks.plain).toHaveBeenCalled();
        expect(reply.message.content).toBe('A plain answer.');
        expect(savedMessage().metadata).toEqual({});
        // Seb must be told he cannot look anything up, or he will claim he did.
        expect((mocks.plain.mock.calls[0][1] as Record<string, string>[])[0].content).toContain('no tools');
    });

    it('falls back when the provider rejects the request outright', async () => {
        mocks.completion.mockRejectedValue(new SebProviderError('REQUEST'));
        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Hello' });
        expect(reply.message.content).toBe('A plain answer.');
        expect(mocks.plain).toHaveBeenCalled();
    });

    it('answers from context when the tools turn comes back empty', async () => {
        mocks.completion.mockResolvedValue(assistant('   '));
        mocks.plain.mockResolvedValue('  Let me answer from what I can see.  ');
        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Hello' });
        expect(reply.message.content).toBe('Let me answer from what I can see.');
    });

    it('still answers when the member has no grants to offer', async () => {
        mocks.permissions.mockResolvedValue([]);
        mocks.allowed.mockReturnValue(new Set());
        mocks.available.mockReturnValue([]);
        mocks.definitions.mockReturnValue([]);
        const reply = await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', message: 'Hello' });
        expect(mocks.runTool).not.toHaveBeenCalled();
        expect(reply.message.content).toBe('A plain answer.');
    });
});

describe('the thread it writes into', () => {
    it('reuses the session and replays its history', async () => {
        mocks.completion.mockResolvedValue(assistant('As I said.'));
        mocks.messageFind.mockResolvedValue([{ role: 'USER', content: 'Earlier' }, { role: 'ASSISTANT', content: 'My earlier answer' }]);

        await chatWithSeb({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-9', message: 'And then?' });

        expect(mocks.session).toHaveBeenCalledWith({ where: { id: 'session-9', organizationId: 'org-1' } });
        const messages = sentMessages(0);
        expect(messages[0].content).toContain('You are Seb.');
        expect(messages.slice(2, 5)).toEqual([
            { role: 'user', content: 'Earlier' },
            { role: 'assistant', content: 'My earlier answer' },
            { role: 'user', content: 'And then?' },
        ]);
    });

    it('refuses to write into a session belonging to another organization', async () => {
        mocks.session.mockResolvedValue(null);
        await expect(chatWithSeb({ organizationId: 'org-2', userId: 'user-1', sessionId: 'session-9', message: 'Hello' })).rejects.toThrow('Seb chat session not found');
        expect(mocks.messageCreate).not.toHaveBeenCalled();
    });
});
