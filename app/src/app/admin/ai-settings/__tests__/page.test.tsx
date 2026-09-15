import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AISettingsPage from '../page';

const fetchMock = vi.fn();
const config = { isConfigured: true, sebModel: 'current/model', sebModelName: 'Current' };
const model = { id: 'vision/model', name: 'Vision Model', modality: 'text,image->text', supportsImageInput: true,
    supportsStructuredOutputs: true, contextLength: 128000, maxCompletionTokens: 16000,
    reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['low', 'high'], supportsMaxTokens: false } };
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('admin model capabilities', () => {
    it('shows image, schema, reasoning and cap capabilities before selection and submits one model', async () => {
        fetchMock.mockImplementation(async (url, options) => Response.json(options?.method === 'PUT' ? { success: true }
            : url.startsWith('/api/openrouter/models') ? { models: [model] } : { config }));
        render(<AISettingsPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
        const selection = await screen.findByRole('button', { name: /Vision Model/ });
        expect(selection.textContent).toContain('image input');
        expect(selection.textContent).toContain('JSON schema supported');
        expect(selection.textContent).toContain('Reasoning required');
        expect(selection.textContent).toContain('low, high');
        fireEvent.click(selection);
        fireEvent.click(screen.getByRole('button', { name: 'Save AI Settings' }));
        await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(true));
        const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')![1].body);
        expect(body).toMatchObject({ sebModel: 'vision/model', sebModelName: 'Vision Model' });
        expect(body).not.toHaveProperty('selectedModel');
    });
    it('presents catalogue outage and still allows saving unchanged model settings', async () => {
        fetchMock.mockImplementation(async (url, options) => url.startsWith('/api/openrouter/models')
            ? Response.json({ error: 'Model capabilities are unavailable' }, { status: 503 })
            : Response.json(options?.method === 'PUT' ? { success: true } : { config }));
        render(<AISettingsPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
        expect((await screen.findByRole('alert')).textContent).toContain('unavailable');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Seb chat and reports enabled' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save AI Settings' }));
        await screen.findByText('AI settings saved successfully');
        const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')![1].body);
        expect(body).toMatchObject({ sebModel: 'current/model', sebEnabled: false });
    });
    it('shows server selection validation failures without claiming success', async () => {
        fetchMock.mockImplementation(async (_url, options) => options?.method === 'PUT'
            ? Response.json({ error: 'Seb requires a model with image input support' }, { status: 400 }) : Response.json({ config }));
        render(<AISettingsPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Save AI Settings' }));
        await screen.findByText('Seb requires a model with image input support');
        expect(screen.queryByText('AI settings saved successfully')).toBeNull();
    });
});
