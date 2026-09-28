/** Preserve the real stack and route for otherwise opaque Next request failures. */
export async function onRequestError(
    error: unknown,
    request: { path: string; method: string },
    context: { routerKind: string; routePath: string; routeType: string },
) {
    const { logger } = await import('@/lib/logger');
    logger.error({ err: error, path: request.path.split('?')[0], method: request.method, ...context },
        'Next request failed');
}
