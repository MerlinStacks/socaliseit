/** Additive publishing detail; the persisted/public post statuses stay compatible. */
export const SAFE_PUBLISH_FAILURES = new Set([
    'CIRCUIT_OPEN', 'PRE_DISPATCH_FAILED', 'ACCOUNT_REMOVED', 'ACCOUNT_DISCONNECTED',
    'VIDEO_TRANSCODE_TIMEOUT', 'VIDEO_TRANSCODE_MISSING', 'MISSING_VIDEO', 'VIDEO_NOT_SUPPORTED',
]);

export function isPendingPublishId(id?: string | null): boolean {
    return !!id && ['tiktok_pending:', 'ig_pending:', 'threads_pending:', 'bsky_pending:']
        .some(prefix => id.startsWith(prefix));
}

export function getPublishingStatus(post: { status: string; platformPostId?: string | null }, errorCode?: string | null) {
    const status = post.status.toUpperCase();
    if (isPendingPublishId(post.platformPostId)) return {
        label: 'Awaiting platform confirmation', canRetry: false,
        message: 'The platform is still processing this post. Check the platform before posting again; retrying could create a duplicate.',
    };
    if (status === 'PUBLISHED') return { label: 'Published', canRetry: false, message: 'Publishing is confirmed.' };
    if (post.platformPostId || errorCode === 'PUBLISH_OUTCOME_UNKNOWN' || (errorCode === 'PUBLISH_DISPATCHED' && status !== 'PUBLISHING')) return {
        label: 'Confirmation needed', canRetry: false,
        message: 'This post may already be live. Check your connected account on the platform. Automatic republishing is blocked to avoid duplicates.',
    };
    if (status === 'PUBLISHING') return {
        label: 'Publishing', canRetry: false,
        message: 'Publishing is in progress. Large videos can take several minutes. Refresh status rather than starting another upload.',
    };
    if (status === 'FAILED') {
        const canRetry = SAFE_PUBLISH_FAILURES.has(errorCode || '');
        return {
            label: canRetry ? 'Not sent to platform' : 'Confirmation needed', canRetry,
            message: canRetry ? 'This attempt did not send the post. Fix the issue below, then retry publishing.'
                : 'We cannot confirm whether this attempt reached the platform. Check your connected account before posting again. Automatic republishing is blocked.',
        };
    }
    return { label: status === 'SCHEDULED' ? 'Queued / scheduled' : 'Draft', canRetry: false,
        message: status === 'SCHEDULED' ? 'Waiting for the publishing worker or scheduled time. This is not confirmation that the post is live.' : 'This post has not been queued.' };
}

export class PublishingConflictError extends Error {}
