/** Include warning call sites, rather than just pg's one-line deprecation notice. */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const { logger } = await import('@/lib/logger');
    process.on('warning', warning => {
        logger.warn({ err: warning }, 'Node runtime warning');
    });
}

/** Preserve real failures, but do not page on cancelled media reads. */
export async function onRequestError(
    error: unknown,
    request: { path: string; method: string },
    context: { routerKind: string; routePath: string; routeType: string },
) {
    const { logger } = await import('@/lib/logger');
    const path = request.path.split('?')[0];
    const details = { err: error, path, method: request.method, ...context };
    if (error instanceof Error && error.name === 'ResponseAborted'
        && context.routePath === '/api/uploads/[...path]' && ['GET', 'HEAD'].includes(request.method)) {
        logger.debug({ path, method: request.method }, 'Media response cancelled by client');
    } else if (error instanceof Error && error.message.startsWith('Failed to find Server Action')) {
        // Stale deployments or invalid action IDs: retain evidence without treating
        // these client requests as an application crash.
        logger.warn(details, 'Unknown Server Action requested');
    } else {
        logger.error(details, 'Next request failed');
    }
}
