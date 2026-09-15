import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AICaptionGenerator } from '../ai-caption-generator';

const fetchMock = vi.fn();

describe('AICaptionGenerator', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => vi.unstubAllGlobals());

    it('generates via the API and uses returned text without duplicate hashtags or fake scores', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({
            success: true,
            data: { caption: 'Our new collection #launch', hashtags: ['#launch', '#shop'], viralityScore: 0.9 },
        })));
        const onSelect = vi.fn();
        render(<AICaptionGenerator platform="bluesky" onSelect={onSelect} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Our new collection launches today' } });
        fireEvent.click(screen.getByRole('button', { name: 'Generate Caption' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Use This' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/ai/generate-caption', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ prompt: 'Our new collection launches today', platform: 'bluesky', contentType: 'product', includeHashtags: true, maxLength: 300 }),
        }));
        expect(onSelect).toHaveBeenCalledWith('Our new collection #launch', ['#shop']);
        expect(screen.queryByText('Virality Score')).toBeNull();
        expect(screen.queryByText('Brand Match')).toBeNull();
    });

    it('sends quick improvements as rewrite instructions and accepts caption-only responses', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { caption: 'Short caption #launch' } })));
        const onSelect = vi.fn();
        render(<AICaptionGenerator platform="instagram" currentDraft="Original draft" onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button', { name: /Make it shorter/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Improve Caption' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Use This' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/ai/rewrite-caption', expect.objectContaining({
            body: JSON.stringify({ caption: 'Original draft', platform: 'instagram', instruction: 'Make it shorter' }),
        }));
        expect(onSelect).toHaveBeenCalledWith('Short caption #launch', []);
    });

    it('shows API errors and allows retrying with a custom instruction', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again later.' }), { status: 429 }));
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { caption: 'Rewritten draft' } })));
        render(<AICaptionGenerator platform="instagram" currentDraft="Original draft" onSelect={vi.fn()} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep the opening sentence' } });
        fireEvent.click(screen.getByRole('button', { name: 'Improve Caption' }));
        expect((await screen.findByRole('alert')).textContent).toContain('Rate limit exceeded');
        fireEvent.click(screen.getByRole('button', { name: 'Improve Caption' }));
        await screen.findByText('Rewritten draft');
        expect(screen.queryByRole('alert')).toBeNull();
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).instruction).toBe('Keep the opening sentence');
    });

    it.each([
        () => Promise.reject(new Error('Network unavailable')),
        () => Promise.resolve(new Response('not JSON', { status: 502 })),
        () => Promise.resolve(new Response(JSON.stringify({ success: true, data: { caption: '' } }))),
    ])('recovers from network or invalid response failures', async (respond) => {
        fetchMock.mockImplementation(respond);
        render(<AICaptionGenerator platform="instagram" currentDraft="Original draft" onSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Improve Caption' }));
        await screen.findByRole('alert');
        await waitFor(() => expect((screen.getByRole('button', { name: 'Improve Caption' }) as HTMLButtonElement).disabled).toBe(false));
        expect(screen.queryByRole('button', { name: 'Use This' })).toBeNull();
    });

    it('validates the generation prompt before making a request', async () => {
        render(<AICaptionGenerator platform="instagram" onSelect={vi.fn()} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'short' } });
        fireEvent.click(screen.getByRole('button', { name: 'Generate Caption' }));
        expect((await screen.findByRole('alert')).textContent).toContain('10–500');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
