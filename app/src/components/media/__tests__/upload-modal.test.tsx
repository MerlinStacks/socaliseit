import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadModal, type UploadedMedia } from '../upload-modal';

/**
 * The Add Media dialog sits inside the composer, which has its own page-level
 * drop zone. A drop inside the dialog must therefore stay inside the dialog:
 * files are staged and only reach the server (and the post) when "Add" is clicked.
 */

/** Records every request the modal makes, so tests can assert when uploads start. */
let xhrSends: FormData[] = [];

class FakeXHR {
    upload = { onprogress: null as null | ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) };
    status = 200;
    responseText = JSON.stringify({
        id: 'media-1',
        url: '/media/media-1.png',
        thumbnailUrl: '/media/media-1-thumb.png',
        type: 'image',
        mimeType: 'image/png',
        size: 2048,
        filename: 'photo.png',
        dimensions: { width: 1080, height: 1350 },
        transcodeStatus: null,
    });
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    open() { /* no-op */ }

    send(body: FormData) {
        xhrSends.push(body);
        this.onload?.();
    }

    setRequestHeader() { /* no-op */ }
    abort() { /* no-op */ }
    getAllResponseHeaders() { return ''; }
    getResponseHeader() { return null; }
}

/** jsdom never loads images, so the dimension probe is stubbed to resolve. */
class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 1080;
    height = 1350;

    set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
    }
}

function png(name = 'photo.png') {
    return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

/** Fires a real bubbling drop event, like dragging a file onto an element. */
function dropFiles(target: Element, files: File[]) {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    target.dispatchEvent(event);
}

function mount(props: Partial<Parameters<typeof UploadModal>[0]> = {}) {
    const onUpload = vi.fn(async (_media: UploadedMedia[]) => {});
    const onOpenChange = vi.fn();
    const onComposerDrop = vi.fn();

    const view = render(
        // Stands in for the composer: its whole surface is a drop zone.
        <div data-testid="composer" onDrop={onComposerDrop} onDragOver={(e) => e.preventDefault()}>
            <UploadModal
                open
                onOpenChange={onOpenChange}
                folders={[]}
                defaultFolderId={null}
                onUpload={onUpload}
                {...props}
            />
        </div>,
    );

    return { ...view, onUpload, onOpenChange, onComposerDrop };
}

const dropZone = () => screen.getByText(/drag & drop files here/i);

beforeEach(() => {
    xhrSends = [];
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    vi.stubGlobal('Image', FakeImage);
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('UploadModal upload timing', () => {
    it('stages a dropped file without uploading it', async () => {
        const { onComposerDrop } = mount();

        dropFiles(dropZone(), [png()]);

        expect(await screen.findByText('photo.png')).toBeTruthy();
        expect(xhrSends).toHaveLength(0);
        // Why: bubbling into the composer's own drop zone would upload and add
        // the file to the post before the user confirms.
        expect(onComposerDrop).not.toHaveBeenCalled();
    });

    it('uploads the staged files when Add is clicked', async () => {
        const { onUpload } = mount();

        dropFiles(dropZone(), [png()]);
        await screen.findByText('photo.png');

        fireEvent.click(screen.getByRole('button', { name: /add \(1\)/i }));

        await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
        expect(xhrSends).toHaveLength(1);
        expect(onUpload.mock.calls[0][0]).toMatchObject([{ id: 'media-1', filename: 'photo.png' }]);
    });

    it('stages a drop that lands outside the drop zone', async () => {
        const { onComposerDrop } = mount();

        // Why: the dialog's own chrome (folder selector, file list) is still part of
        // the dialog, so a drop there belongs to the staged list, not the composer.
        dropFiles(screen.getByRole('combobox'), [png('elsewhere.png')]);

        expect(await screen.findByText('elsewhere.png')).toBeTruthy();
        expect(xhrSends).toHaveLength(0);
        expect(onComposerDrop).not.toHaveBeenCalled();
    });

    it('uploads nothing when the dialog is dismissed', async () => {
        const { onUpload, onOpenChange } = mount();

        dropFiles(dropZone(), [png()]);
        await screen.findByText('photo.png');

        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(xhrSends).toHaveLength(0);
        expect(onUpload).not.toHaveBeenCalled();
    });
});
