import { renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComposerDrop } from '../use-composer-drop';

const uploadFiles = vi.fn();

vi.mock('@/hooks/use-media-upload', () => ({
    useMediaUpload: () => ({ uploadFiles, isUploading: false, progress: 0 }),
}));

function dropEvent(files: File[]) {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { types: ['Files'], files },
    } as unknown as DragEvent;
}

beforeEach(() => {
    uploadFiles.mockReset().mockResolvedValue([{ id: 'media-1', url: '/media/1.png', type: 'image', size: 10, mimeType: 'image/png', filename: 'photo.png' }]);
});

describe('useComposerDrop', () => {
    it('uploads dropped files and hands them to the composer', async () => {
        const onUploaded = vi.fn(async () => {});
        const { result } = renderHook(() => useComposerDrop(onUploaded));

        await result.current.dropHandlers.onDrop(dropEvent([new File(['x'], 'photo.png', { type: 'image/png' })]));

        expect(uploadFiles).toHaveBeenCalledTimes(1);
        expect(onUploaded).toHaveBeenCalledTimes(1);
    });

    it('ignores drops while a media dialog holds them', async () => {
        const onUploaded = vi.fn(async () => {});
        const { result } = renderHook(() => useComposerDrop(onUploaded, { enabled: false }));

        await result.current.dropHandlers.onDrop(dropEvent([new File(['x'], 'photo.png', { type: 'image/png' })]));

        // Why: the dialog stages files and uploads them on "Add", so the composer
        // must not add the same file to the post straight away.
        expect(uploadFiles).not.toHaveBeenCalled();
        expect(onUploaded).not.toHaveBeenCalled();
        // Why: the browser default would open the file instead.
        expect(result.current.isDragOver).toBe(false);
    });
});
