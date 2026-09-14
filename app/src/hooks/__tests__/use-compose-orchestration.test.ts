import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useComposeOrchestration } from '../use-compose-orchestration';

const mocks = vi.hoisted(() => ({
    compose: {} as Record<string, any>,
    prepare: vi.fn(), publish: vi.fn(), schedule: vi.fn(), toast: vi.fn(), preview: vi.fn(),
}));
vi.mock('@/hooks/use-compose', () => ({ useCompose: () => mocks.compose }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/hooks/use-calendar-data', () => ({}));
vi.mock('@/components/ui/celebration', () => ({ useCelebration: () => ({ celebratePublish: vi.fn() }) }));
vi.mock('@/lib/compose-offline', () => ({
    useOnlineStatus: () => true, useDraftCache: vi.fn(), useOfflinePublish: () => ({}),
}));
vi.mock('@/lib/pwa-file-handler', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: {} }));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/offline-queue', () => ({ deleteDraft: vi.fn() }));
vi.mock('@/hooks/use-unsaved-changes', () => ({ useUnsavedChanges: vi.fn() }));
vi.mock('@/hooks/use-composer-drop', () => ({ useComposerDrop: () => ({}) }));
vi.mock('@/lib/validation', () => ({ validatePost: () => [], getValidationSummary: () => ({ errors: 0 }) }));
vi.mock('@/hooks/use-image-resize', () => ({ useImageResize: (...args: unknown[]) => {
    mocks.preview(...args);
    return { resizedMedia: args[0], resizeAlerts: [], isResizing: false, prepareMedia: mocks.prepare };
} }));
vi.mock('@/lib/compose-actions', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/compose-actions')>(),
    handlePublishNow: mocks.publish, handleScheduleConfirm: mocks.schedule,
}));

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    const accounts = [
        { id: 'google', platform: 'google_business' },
        { id: 'feed', platform: 'instagram' },
        { id: 'story', platform: 'instagram' },
    ];
    mocks.compose = {
        caption: 'Caption', firstComment: '', media: ['a', 'b', 'c'].map(id => ({
            id, url: `/${id}`, type: 'image', size: 10, width: 600, height: 600,
        })),
        selectedAccounts: accounts, selectedAccountIds: accounts.map(a => a.id),
        uniquePlatforms: ['google_business', 'instagram'], activeAccount: accounts[0],
        effectiveAccountSettings: {
            google: { postType: 'feed', mediaOverride: ['c', 'a'] },
            feed: { postType: 'feed' }, story: { postType: 'story', mediaOverride: ['b'] },
        },
        setIsPublishing: vi.fn(), setIsScheduling: vi.fn(), setIsScheduleModalOpen: vi.fn(),
        router: { back: vi.fn() },
    };
    mocks.prepare.mockImplementation(async (media, platform, postType) => ({
        media: media.map((item: { id: string }) => ({ ...item, id: `${platform}-${postType}-${item.id}` })), alerts: [],
    }));
    mocks.publish.mockResolvedValue(undefined);
    mocks.schedule.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('compose image preparation', () => {
    it('prepares every account independently after selecting ordered overrides', async () => {
        const { result } = renderHook(() => useComposeOrchestration());
        await act(async () => { await result.current.onPublishNow(); });
        expect(mocks.prepare.mock.calls.map(([items, platform, postType]) => [items.map((m: { id: string }) => m.id), platform, postType])).toEqual([
            [['c', 'a'], 'google_business', 'feed'],
            [['a', 'b', 'c'], 'instagram', 'feed'],
            [['b'], 'instagram', 'story'],
        ]);
        expect(mocks.publish.mock.calls[0][0].resizedMediaMap.google.map((m: { id: string }) => m.id))
            .toEqual(['google_business-feed-c', 'google_business-feed-a']);
    });

    it('uses effective ordered preview media when auto resize is disabled', () => {
        localStorage.setItem('compose-auto-resize', 'false');
        const { result } = renderHook(() => useComposeOrchestration());
        expect(result.current.resizedMedia.map((m: { id: string }) => m.id)).toEqual(['c', 'a']);
        expect(mocks.preview.mock.calls[0][3]).toBe(false);
    });

    it('waits for preparation, blocks duplicate actions, and rejects edits during flight', async () => {
        let resolve!: (value: { media: []; alerts: [] }) => void;
        mocks.prepare.mockReturnValue(new Promise(done => { resolve = done; }));
        const { result, rerender } = renderHook(() => useComposeOrchestration());
        let pending!: Promise<void>;
        act(() => { pending = result.current.onPublishNow(); });
        await result.current.onPublishNow();
        await result.current.onScheduleConfirm(null, '2026-10-01', '12:00');
        expect(mocks.prepare).toHaveBeenCalledTimes(3);
        expect(mocks.publish).not.toHaveBeenCalled();
        mocks.compose = { ...mocks.compose, caption: 'Edited during preparation' };
        rerender();
        await act(async () => { resolve({ media: [], alerts: [] }); await pending; });
        expect(mocks.publish).not.toHaveBeenCalled();
        expect(mocks.schedule).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith('error', 'Publish failed', expect.stringContaining('post changed'));
        expect(mocks.compose.setIsPublishing).toHaveBeenLastCalledWith(false);
    });

    it('stops schedule on preparation failure and releases the guard for retry', async () => {
        mocks.prepare.mockRejectedValue(new Error('Crop failed'));
        const { result } = renderHook(() => useComposeOrchestration());
        await act(async () => { await result.current.onScheduleConfirm(null, '2026-10-01', '12:00'); });
        expect(mocks.schedule).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith('error', 'Schedule failed', 'Crop failed');
        mocks.prepare.mockResolvedValue({ media: [], alerts: [] });
        await act(async () => { await result.current.onScheduleConfirm(null, '2026-10-01', '12:00'); });
        expect(mocks.schedule).toHaveBeenCalledTimes(1);
        expect(mocks.compose.setIsScheduling).toHaveBeenLastCalledWith(false);
    });
});
