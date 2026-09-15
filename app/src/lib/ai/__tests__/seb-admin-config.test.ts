// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validateSebModel } from '../openrouter-models';
import { SebProviderError } from '../seb-provider-error';
vi.mock('../openrouter-models', () => ({ validateSebModel: vi.fn() }));

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), encrypt: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { globalAISettings: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));
vi.mock('@/lib/crypto', () => ({ encrypt: mocks.encrypt, decrypt: () => 'secret', maskSecret: () => 'masked' }));
vi.mock('@/lib/admin/middleware', () => ({ withSuperAdmin: (handler: (request: NextRequest, admin: { userId: string }) => unknown) => (request: NextRequest) => handler(request, { userId: 'admin' }) }));
vi.mock('@/lib/admin/audit', () => ({ recordAuditLog: mocks.audit, AUDIT_ACTIONS: { SETTINGS_UPDATE: 'update' } }));

import { GET, PUT } from '@/app/api/admin/ai-config/route';

const existing = {
    apiKey: 'original-encrypted-key', isConfigured: true, sebEnabled: true,
    sebModel: 'seb/current', sebModelName: 'Current', selectedModel: 'legacy/stale', modelName: 'Stale',
};
const request = (body: object) => new NextRequest('http://localhost/api/admin/ai-config', { method: 'PUT', body: JSON.stringify(body) });
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateSebModel).mockReset().mockResolvedValue({ supportsImageInput: true } as never);
    mocks.findUnique.mockResolvedValue({ ...existing });
    mocks.upsert.mockImplementation(async ({ update }) => ({ ...existing, ...update }));
    mocks.encrypt.mockReturnValue('new-encrypted-key');
});

describe('single-model admin configuration', () => {
    it('rejects text-only selections with clear server validation', async () => {
        vi.mocked(validateSebModel).mockRejectedValue(new SebProviderError('MODEL'));
        const response = await PUT(request({ sebModel: 'text/only' }));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain('image input');
        expect(mocks.upsert).not.toHaveBeenCalled();
    });
    it('blocks new selections during outage but saves unchanged model settings and keys', async () => {
        vi.mocked(validateSebModel).mockRejectedValue(new SebProviderError('METADATA'));
        expect((await PUT(request({ sebModel: 'new/model' }))).status).toBe(503);
        expect(mocks.upsert).not.toHaveBeenCalled();
        expect((await PUT(request({ sebModel: existing.sebModel, sebTemperature: 0.2, apiKey: 'replacement' }))).status).toBe(200);
        expect(validateSebModel).toHaveBeenCalledTimes(1);
    });
    it('exposes legacy response fields as aliases of the actual Seb model', async () => {
        const response = await GET(new NextRequest('http://localhost/api/admin/ai-config'));
        expect((await response.json()).config).toMatchObject({ sebModel: 'seb/current', selectedModel: 'seb/current', modelName: 'Current', apiKeyMasked: 'masked' });
    });

    it('changes chat gating without changing provider configuration or credentials', async () => {
        const response = await PUT(request({ sebEnabled: false }));
        expect(response.status).toBe(200);
        expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({ sebEnabled: false, sebModel: 'seb/current', apiKey: existing.apiKey, isConfigured: true });
        expect(mocks.encrypt).not.toHaveBeenCalled();
    });

    it('preserves provider unavailable status on settings-only saves', async () => {
        mocks.findUnique.mockResolvedValue({ ...existing, isConfigured: false });
        await PUT(request({ sebEnabled: true }));
        expect(mocks.upsert.mock.calls[0][0].update.isConfigured).toBe(false);
    });

    it('accepts a legacy client model selection as an explicit Seb model update', async () => {
        const response = await PUT(request({ selectedModel: 'legacy/new', modelName: 'New' }));
        expect((await response.json()).config).toMatchObject({ sebModel: 'legacy/new', selectedModel: 'legacy/new', sebModelName: 'New' });
    });

    it('prefers explicit Seb selection when both fields are submitted', async () => {
        await PUT(request({ sebModel: 'seb/new', sebModelName: 'Seb', selectedModel: 'legacy/new' }));
        expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({ sebModel: 'seb/new', sebModelName: 'Seb' });
    });

    it('initializes the explicit default with a new key and no model', async () => {
        mocks.findUnique.mockResolvedValue(null);
        await PUT(request({ apiKey: 'new-key' }));
        expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ sebModel: 'openai/gpt-4o-mini', apiKey: 'new-encrypted-key', isConfigured: true });
    });

    it.each(['', '  ', 123])('rejects invalid model %j without writing', async sebModel => {
        expect((await PUT(request({ sebModel }))).status).toBe(400);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });
});
