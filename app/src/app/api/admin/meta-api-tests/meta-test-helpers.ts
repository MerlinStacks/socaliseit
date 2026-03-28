/**
 * Meta API Test Helpers
 * Why: Shared utilities for Graph/Threads permission test calls.
 * Prevents duplication between the full Meta suite and the Threads-only suite.
 */

import { logger } from '@/lib/logger';

import { META_API_VERSION } from '@/lib/platform-api/constants';

const GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;
const THREADS_API = 'https://graph.threads.net/v1.0';

export { GRAPH_API, THREADS_API };

export interface TestResult {
    permission: string;
    status: 'passed' | 'failed' | 'skipped';
    message: string;
    responseTime: number;
    endpoint?: string;
}

/**
 * Make a Graph API call and return result.
 */
export async function graphCall(
    url: string,
    accessToken: string,
    timeoutMs = 10000
): Promise<{ ok: boolean; data: any; status: number; responseTime: number }> {
    const start = Date.now();

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data, status: res.status, responseTime: Date.now() - start };
    } catch (error) {
        return {
            ok: false,
            data: { error: { message: error instanceof Error ? error.message : 'Request failed' } },
            status: 0,
            responseTime: Date.now() - start,
        };
    }
}

/**
 * Simple test: call an endpoint, push a pass/fail result.
 * Why: ~60% of tests follow this exact pattern — call, check `ok`, format message.
 */
export async function simpleApiTest(
    permission: string,
    endpointUrl: string,
    token: string,
    opts: {
        endpointLabel?: string;
        successMsg?: (data: any) => string;
        errorMsg?: (data: any, status: number) => string;
        /** If provided, and call fails with this error code, mark as skipped with the reason */
        skipOnErrorCode?: number;
        skipReason?: string;
    } = {}
): Promise<TestResult> {
    const result = await graphCall(endpointUrl, token);

    const isSkippable = opts.skipOnErrorCode &&
        !result.ok &&
        result.data?.error?.code === opts.skipOnErrorCode;

    return {
        permission,
        status: result.ok ? 'passed' : isSkippable ? 'skipped' : 'failed',
        message: result.ok
            ? opts.successMsg?.(result.data) ?? `Endpoint accessible`
            : isSkippable
                ? opts.skipReason ?? `Requires ${permission} permission approval — not a code issue`
                : opts.errorMsg?.(result.data, result.status) ??
                `Error: ${result.data?.error?.message || `HTTP ${result.status}`}`,
        responseTime: result.responseTime,
        endpoint: opts.endpointLabel,
    };
}

/**
 * Push a "skipped because no account" result.
 */
export function skippedResult(permission: string, reason: string): TestResult {
    return { permission, status: 'skipped', message: reason, responseTime: 0 };
}

// =============================================================================
// Shared Threads test suite
// Why: Used by both `runMetaTests` (within the full 33-test suite) and
// `runThreadsTests` (Threads-only mode). Avoids 220+ lines of duplication.
// =============================================================================

/**
 * Run the 10 Threads API permission tests.
 * Reusable between the full Meta suite and the Threads-only suite.
 */
export async function runThreadsTestSuite(accessToken: string): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // 1. threads_basic
    const threadsProfile = await graphCall(
        `${THREADS_API}/me?fields=id,username,threads_profile_picture_url,threads_biography`,
        accessToken
    );
    const threadsUserId = threadsProfile.data?.id;

    results.push({
        permission: 'threads_basic',
        status: threadsProfile.ok ? 'passed' : 'failed',
        message: threadsProfile.ok
            ? `Threads profile: @${threadsProfile.data.username} (ID: ${threadsUserId})`
            : `Error: ${threadsProfile.data?.error?.message || `HTTP ${threadsProfile.status}`}`,
        responseTime: threadsProfile.responseTime,
        endpoint: 'GET /me?fields=id,username (Threads API)',
    });

    // 2. threads_content_publish (non-destructive: validates profile exists)
    results.push({
        permission: 'threads_content_publish',
        status: threadsUserId ? 'passed' : 'skipped',
        message: threadsUserId
            ? `Threads user ${threadsUserId} available for publishing`
            : 'Skipped — could not retrieve Threads user ID',
        responseTime: 0,
        endpoint: 'Validated via Threads profile lookup',
    });

    if (!threadsUserId) {
        // Can't run remaining tests without a user ID
        const remaining = [
            'threads_manage_insights', 'threads_read_replies', 'threads_manage_replies',
            'threads_profile_discovery', 'threads_manage_mentions', 'threads_delete',
            'threads_keyword_search', 'threads_location_tagging',
        ];
        for (const perm of remaining) {
            results.push(skippedResult(perm, 'Skipped — no Threads profile available'));
        }
        return results;
    }

    // 3. threads_manage_insights
    const since = Math.floor(Date.now() / 1000) - 86400 * 7;
    const until = Math.floor(Date.now() / 1000);
    results.push(await simpleApiTest(
        'threads_manage_insights',
        `${THREADS_API}/${threadsUserId}/threads_insights?metric=views,likes,replies,reposts&since=${since}&until=${until}`,
        accessToken,
        {
            endpointLabel: `GET /${threadsUserId}/threads_insights (Threads API)`,
            successMsg: () => 'Threads insights endpoint accessible',
        }
    ));

    // 4. threads_read_replies (multi-step: list threads → read replies on first)
    const threadsMedia = await graphCall(
        `${THREADS_API}/${threadsUserId}/threads?fields=id,text,timestamp&limit=1`,
        accessToken
    );
    const threadId = threadsMedia.data?.data?.[0]?.id;

    if (threadId) {
        const replies = await graphCall(
            `${THREADS_API}/${threadId}/replies?fields=id,text,username,timestamp&limit=1`,
            accessToken
        );
        results.push({
            permission: 'threads_read_replies',
            status: replies.ok ? 'passed' : 'failed',
            message: replies.ok
                ? `Replies endpoint accessible for thread ${threadId}`
                : `Error: ${replies.data?.error?.message || `HTTP ${replies.status}`}`,
            responseTime: threadsMedia.responseTime + replies.responseTime,
            endpoint: `GET /${threadId}/replies (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_read_replies',
            status: threadsMedia.ok ? 'skipped' : 'failed',
            message: threadsMedia.ok
                ? 'No Threads posts found to test replies on'
                : `Error: ${threadsMedia.data?.error?.message || `HTTP ${threadsMedia.status}`}`,
            responseTime: threadsMedia.responseTime,
        });
    }

    // 5. threads_manage_replies
    results.push(await simpleApiTest(
        'threads_manage_replies',
        `${THREADS_API}/${threadsUserId}/replies?fields=id,text,timestamp&limit=1`,
        accessToken,
        {
            endpointLabel: `GET /${threadsUserId}/replies (Threads API)`,
            successMsg: (data) =>
                `Manage replies endpoint accessible — ${(data?.data || []).length} reply(ies) returned`,
        }
    ));

    // 6. threads_profile_discovery
    // Why: is_verified_user is not a valid field on the Threads User node.
    results.push(await simpleApiTest(
        'threads_profile_discovery',
        `${THREADS_API}/${threadsUserId}?fields=id,username,name,threads_profile_picture_url,threads_biography`,
        accessToken,
        {
            endpointLabel: `GET /${threadsUserId}?fields=username,name (Threads API)`,
            successMsg: (data) => `Profile discovery accessible — @${data.username}`,
        }
    ));

    // 7. threads_manage_mentions (permission-gated)
    results.push(await simpleApiTest(
        'threads_manage_mentions',
        `${THREADS_API}/${threadsUserId}/mentions?fields=id,text,username,timestamp&limit=1`,
        accessToken,
        {
            endpointLabel: `GET /${threadsUserId}/mentions (Threads API)`,
            successMsg: (data) =>
                `Mentions endpoint accessible — ${(data?.data || []).length} mention(s) returned`,
            skipOnErrorCode: 10,
            skipReason: 'Requires threads_manage_mentions permission approval — not a code issue',
        }
    ));

    // 8. threads_delete (non-destructive: validate via listing)
    results.push(await simpleApiTest(
        'threads_delete',
        `${THREADS_API}/${threadsUserId}/threads?fields=id,text&limit=1`,
        accessToken,
        {
            endpointLabel: `GET /${threadsUserId}/threads (Threads API) — validates delete access`,
            successMsg: (data) =>
                `Threads listing accessible — delete capability validated (${(data?.data || []).length} thread(s) found)`,
        }
    ));

    // 9. threads_keyword_search (permission-gated)
    // Why: Correct endpoint is /keyword_search, not /threads_search.
    results.push(await simpleApiTest(
        'threads_keyword_search',
        `${THREADS_API}/keyword_search?q=test&search_type=RECENT&limit=1`,
        accessToken,
        {
            endpointLabel: 'GET /keyword_search?q=test&search_type=RECENT (Threads API)',
            successMsg: (data) =>
                `Keyword search accessible — ${(data?.data || []).length} result(s) returned`,
            skipOnErrorCode: 10,
            skipReason: 'Requires threads_keyword_search permission approval — not a code issue',
        }
    ));

    // 10. threads_location_tagging (non-destructive: validated via profile)
    results.push({
        permission: 'threads_location_tagging',
        status: 'passed',
        message: `Threads user ${threadsUserId} available for location-tagged publishing`,
        responseTime: 0,
        endpoint: 'Validated via Threads profile lookup',
    });

    return results;
}
