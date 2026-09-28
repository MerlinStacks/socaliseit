import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn(), update: vi.fn(), completion: vi.fn(), images: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { media: { findFirst: mocks.find, findMany: mocks.list, updateMany: mocks.update } } }));
vi.mock('../seb-config', () => ({ getSebProviderSettings: vi.fn().mockResolvedValue({ apiKey: 'key', model: 'vision', temperature: 0.5 }) }));
vi.mock('../seb-transport', () => ({ requestSebCompletion: mocks.completion }));
vi.mock('@/lib/media/tagging-images', () => ({ taggingImages: mocks.images }));
import { analyzeMediaTags } from '../media-tagging';
import { acceptedMediaTags } from '../media-tagging-prompt';

describe('AI media tagging', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.find.mockResolvedValue({ url: '/api/uploads/photo.jpg', mimeType: 'image/jpeg', tags: ['manual'] });
        mocks.list.mockResolvedValue([{ tags: ['wooden sign'] }]);
        mocks.images.mockResolvedValue(['data:image/jpeg;base64,preview']);
        mocks.update.mockResolvedValue({ count: 1 });
        mocks.completion.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ tags: [{ name: 'wooden sign', confidence: 0.95 }] }) } }] });
    });

    it('rejects weak guesses and deduplicates normalized tags against the workspace vocabulary', () => {
        expect(acceptedMediaTags({ tags: [
            { name: '#Wooden_Sign', confidence: 0.9 },
            { name: 'wooden sign', confidence: 1 },
            { name: 'guess', confidence: 0.79 },
            { name: 'Behind-the-scenes', confidence: 0.85 },
        ] }, ['wooden sign'])).toEqual(['wooden sign', 'behind the scenes']);
        expect(() => acceptedMediaTags({ tags: [{ name: 'sign', confidence: 'certain' }] }, [])).toThrow();
    });

    it('preserves concurrent manual edits and scopes every read/write to the workspace', async () => {
        mocks.find.mockResolvedValueOnce({ url: '/api/uploads/photo.jpg', mimeType: 'image/jpeg', tags: [] })
            .mockResolvedValueOnce({ tags: ['manual'] })
            .mockResolvedValueOnce({ tags: ['manual', 'new edit'] });
        mocks.update.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
        await analyzeMediaTags('org-a', 'media-a');
        expect(mocks.update.mock.calls[1][0]).toEqual({
            where: { id: 'media-a', organizationId: 'org-a', tags: { equals: ['manual', 'new edit'] } },
            data: { tags: ['manual', 'new edit', 'wooden sign'], aiTags: ['wooden sign'], aiTagStatus: 'completed', aiTagError: null },
        });
        for (const [query] of mocks.find.mock.calls) expect(query.where.organizationId).toBe('org-a');
        expect(mocks.list.mock.calls[0][0].where.organizationId).toBe('org-a');
        expect(mocks.completion).toHaveBeenCalledOnce();
    });

    it('does not call AI for inaccessible or audio media', async () => {
        mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ mimeType: 'audio/mpeg' });
        await analyzeMediaTags('org-a', 'missing');
        await analyzeMediaTags('org-a', 'audio');
        expect(mocks.completion).not.toHaveBeenCalled();
    });

    it('does not save invalid or truncated AI output', async () => {
        mocks.completion.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: '{"tags":[]}' } }] });
        await expect(analyzeMediaTags('org-a', 'media-a')).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('handles deletion while analysis is running', async () => {
        mocks.find.mockResolvedValueOnce({ url: '/api/uploads/photo.jpg', mimeType: 'image/jpeg' }).mockResolvedValueOnce(null);
        await analyzeMediaTags('org-a', 'media-a');
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
