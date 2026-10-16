import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestError, register } from '../instrumentation';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const request = { path: '/api/uploads/video.mov?private=query', method: 'GET' };
const context = { routerKind: 'App Router', routePath: '/api/uploads/[...path]', routeType: 'route' };
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('captures Node warning stacks for database deprecation diagnosis', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const on = vi.spyOn(process, 'on').mockReturnValue(process);
    await register();
    expect(on).toHaveBeenCalledWith('warning', expect.any(Function));
    const warning = new Error('concurrent query deprecated');
    const listener = on.mock.calls.find(([event]) => event === 'warning')![1];
    listener(warning);
    expect(logger.warn).toHaveBeenCalledWith({ err: warning }, 'Node runtime warning');
});

describe('request error classification', () => {
    it.each(['GET', 'HEAD'])('downgrades cancelled media %s reads without logging query strings', async method => {
        await onRequestError(Object.assign(new Error(), { name: 'ResponseAborted' }), { ...request, method }, context);
        expect(logger.debug).toHaveBeenCalledWith({ path: '/api/uploads/video.mov', method }, expect.any(String));
        expect(logger.error).not.toHaveBeenCalled();
    });
    it('preserves genuine media errors', async () => {
        await onRequestError(new Error('disk failure'), request, context);
        expect(logger.error).toHaveBeenCalledOnce();
    });
    it('does not hide aborted requests to unrelated routes', async () => {
        await onRequestError(Object.assign(new Error(), { name: 'ResponseAborted' }), request, { ...context, routePath: '/api/posts' });
        expect(logger.error).toHaveBeenCalledOnce();
    });
    it('retains invalid server action evidence as a warning', async () => {
        await onRequestError(new Error('Failed to find Server Action "x".'), request, context);
        expect(logger.warn).toHaveBeenCalledOnce();
        expect(logger.error).not.toHaveBeenCalled();
    });
});
