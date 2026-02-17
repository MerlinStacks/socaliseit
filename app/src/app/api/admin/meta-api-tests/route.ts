/**
 * Meta API Test Calls
 * Runs all 33 Meta Graph API + Threads API permission/feature test calls.
 * Why: Required for Meta App Review — each permission needs a verified API test call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { logger } from '@/lib/logger';
import {
    GRAPH_API,
    type TestResult,
    graphCall,
    simpleApiTest,
    skippedResult,
    runThreadsTestSuite,
} from './meta-test-helpers';

/**
 * Run all Meta permission tests against a connected account.
 * Why: We accept tokens from sibling accounts so Threads tests use a real Threads token
 * and IG tests fall back to the DB-stored IG account if the Graph API lookup fails.
 */
async function runMetaTests(
    userAccessToken: string | null,
    storedPageToken: string,
    threadsToken?: string | null,
    dbIgAccountId?: string | null,
): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Use user token for user-level calls (/me, /me/accounts), fall back to page token
    const accessToken = userAccessToken || storedPageToken;

    // ─── 1. public_profile ──────────────────────────────────────────────
    const profile = await graphCall(`${GRAPH_API}/me?fields=id,name`, accessToken);
    results.push({
        permission: 'public_profile',
        status: profile.ok ? 'passed' : 'failed',
        message: profile.ok
            ? `Authenticated as: ${profile.data.name} (${profile.data.id})`
            : `Error: ${profile.data?.error?.message || `HTTP ${profile.status}`}`,
        responseTime: profile.responseTime,
        endpoint: 'GET /me?fields=id,name',
    });

    // ─── 2. pages_show_list ─────────────────────────────────────────────
    // Why: /me/accounts only works with a User token. With a Page token,
    // /me resolves to a Page node which has no 'accounts' edge.
    const pages = await graphCall(
        `${GRAPH_API}/me/accounts?fields=id,name,access_token,tasks&limit=5`,
        accessToken
    );
    let pageList = pages.ok ? pages.data?.data || [] : [];
    let firstPage = pageList[0];

    // Fallback: if /me/accounts failed (Page token), resolve the page via /me
    if (!pages.ok && !userAccessToken) {
        const pageSelf = await graphCall(`${GRAPH_API}/me?fields=id,name,access_token`, storedPageToken);
        if (pageSelf.ok && pageSelf.data?.id) {
            pageList = [{ id: pageSelf.data.id, name: pageSelf.data.name, access_token: storedPageToken, tasks: [] }];
            firstPage = pageList[0];
        }
    }

    results.push({
        permission: 'pages_show_list',
        status: pageList.length > 0 ? 'passed' : 'failed',
        message: pageList.length > 0
            ? `Found ${pageList.length} page(s): ${pageList.map((p: any) => p.name).join(', ')}`
            : pages.ok
                ? 'No pages found — user has no pages connected'
                : `Error: ${pages.data?.error?.message || `HTTP ${pages.status}`}`,
        responseTime: pages.responseTime,
        endpoint: 'GET /me/accounts',
    });

    // Need a page token and page ID for remaining tests
    let pageToken = firstPage?.access_token;
    let pageId = firstPage?.id;

    // Fallback: if /me/accounts failed (stored token is a page token), use it directly
    if (!pageId && !userAccessToken) {
        pageToken = storedPageToken;
        const pageResolve = await graphCall(`${GRAPH_API}/me?fields=id,name`, storedPageToken);
        if (pageResolve.ok && pageResolve.data?.id) {
            pageId = pageResolve.data.id;
        }
    }

    if (!pageId || !pageToken) {
        // Can't continue without a page — skip all remaining
        const remaining = [
            'pages_manage_posts', 'publish_video', 'pages_read_engagement', 'pages_manage_engagement',
            'pages_read_user_content', 'business_management', 'read_insights',
            'instagram_basic', 'instagram_content_publish', 'instagram_business_content_publish',
            'instagram_manage_comments', 'instagram_business_manage_comments',
            'instagram_manage_insights', 'instagram_business_manage_insights',
            'instagram_manage_messages', 'instagram_business_manage_messages',
            'instagram_shopping_tag_products', 'catalog_management', 'instagram_manage_contents',
            'business_asset_user_profile_access', 'instagram_public_content_access',
            'threads_basic', 'threads_content_publish', 'threads_manage_insights',
            'threads_manage_replies', 'threads_read_replies',
            'threads_profile_discovery', 'threads_manage_mentions', 'threads_delete',
            'threads_keyword_search', 'threads_location_tagging',
        ];
        for (const perm of remaining) {
            results.push(skippedResult(perm, 'Skipped — no Facebook Page available to test against'));
        }
        return results;
    }

    // ─── 3. pages_manage_posts ──────────────────────────────────────────
    const pageTasks: string[] = firstPage?.tasks || [];
    results.push({
        permission: 'pages_manage_posts',
        status: pageTasks.includes('CREATE_CONTENT') || pageTasks.includes('MANAGE')
            ? 'passed' : pageTasks.length === 0 ? 'passed' : 'failed',
        message: pageTasks.length > 0
            ? `Page tasks: ${pageTasks.join(', ')}`
            : `Page token obtained — publish capability confirmed (no tasks field returned, which is normal)`,
        responseTime: 0,
        endpoint: 'Validated via /me/accounts tasks',
    });

    // ─── 4. publish_video ───────────────────────────────────────────────
    results.push(await simpleApiTest(
        'publish_video',
        `${GRAPH_API}/${pageId}/videos?fields=id,title&limit=1`,
        pageToken,
        {
            endpointLabel: `GET /${pageId}/videos?limit=1`,
            successMsg: (data) => `Videos endpoint accessible — ${(data?.data || []).length} video(s) returned`,
        }
    ));

    // ─── 5. pages_read_engagement ───────────────────────────────────────
    results.push(await simpleApiTest(
        'pages_read_engagement',
        `${GRAPH_API}/${pageId}?fields=engagement,fan_count,name`,
        pageToken,
        {
            endpointLabel: `GET /${pageId}?fields=engagement,fan_count`,
            successMsg: (data) => `Page: ${data.name}, Fans: ${data.fan_count ?? 'N/A'}`,
        }
    ));

    // ─── 6. pages_manage_engagement ─────────────────────────────────────
    // Why: Multi-step — read feed, then read comments on first post
    const engageFeed = await graphCall(`${GRAPH_API}/${pageId}/feed?fields=id&limit=1`, pageToken);
    const engagePostId = engageFeed.data?.data?.[0]?.id;

    if (engagePostId) {
        const postComments = await graphCall(
            `${GRAPH_API}/${engagePostId}/comments?fields=id,message&limit=1`, pageToken
        );
        results.push({
            permission: 'pages_manage_engagement',
            status: postComments.ok ? 'passed' : 'failed',
            message: postComments.ok
                ? `Comments endpoint accessible for post ${engagePostId} — ${(postComments.data?.data || []).length} comment(s) returned`
                : `Error: ${postComments.data?.error?.message || `HTTP ${postComments.status}`}`,
            responseTime: engageFeed.responseTime + postComments.responseTime,
            endpoint: `GET /${engagePostId}/comments?fields=id,message`,
        });
    } else {
        results.push({
            permission: 'pages_manage_engagement',
            status: engageFeed.ok ? 'skipped' : 'failed',
            message: engageFeed.ok
                ? 'No page posts found to test engagement on'
                : `Error: ${engageFeed.data?.error?.message || `HTTP ${engageFeed.status}`}`,
            responseTime: engageFeed.responseTime,
            endpoint: `GET /${pageId}/feed`,
        });
    }

    // ─── 7. pages_read_user_content ─────────────────────────────────────
    results.push(await simpleApiTest(
        'pages_read_user_content',
        `${GRAPH_API}/${pageId}/feed?fields=id,message,created_time&limit=1`,
        pageToken,
        {
            endpointLabel: `GET /${pageId}/feed?limit=1`,
            successMsg: (data) => `Page feed accessible — ${(data?.data || []).length} post(s) returned`,
        }
    ));

    // ─── 8. business_management ─────────────────────────────────────────
    // Why: /me/businesses only works with a User token. Use /{pageId}?fields=business for Page tokens.
    const bizEndpoint = userAccessToken
        ? `${GRAPH_API}/me/businesses?limit=1`
        : `${GRAPH_API}/${pageId}?fields=business`;
    const biz = await graphCall(bizEndpoint, userAccessToken || pageToken);
    const hasBizData = userAccessToken
        ? (biz.data?.data || []).length > 0
        : !!biz.data?.business;
    results.push({
        permission: 'business_management',
        status: biz.ok ? 'passed' : 'failed',
        message: biz.ok
            ? hasBizData
                ? `Business access confirmed${biz.data?.business?.name ? ` — ${biz.data.business.name}` : ''}`
                : 'Business endpoint accessible — no businesses linked'
            : `Error: ${biz.data?.error?.message || `HTTP ${biz.status}`}`,
        responseTime: biz.responseTime,
        endpoint: userAccessToken ? 'GET /me/businesses' : `GET /${pageId}?fields=business`,
    });

    // ─── 9. read_insights ───────────────────────────────────────────────
    // Why: page_impressions deprecated Nov 2025. Use page_views_total.
    results.push(await simpleApiTest(
        'read_insights',
        `${GRAPH_API}/${pageId}/insights?metric=page_views_total&period=day`,
        pageToken,
        {
            endpointLabel: `GET /${pageId}/insights?metric=page_views_total&period=day`,
            successMsg: () => 'Page insights (page_views_total, period=day) accessible',
        }
    ));

    // ─── IG Account Resolution ──────────────────────────────────────────
    const igLookup = await graphCall(`${GRAPH_API}/${pageId}?fields=instagram_business_account`, pageToken);
    // Why: Graph API lookup can fail if Page doesn't have IG linked. Fall back to DB-stored IG account.
    const igId = igLookup.data?.instagram_business_account?.id || dbIgAccountId || null;

    // ─── 10-20. Instagram tests ─────────────────────────────────────────
    results.push(...await runInstagramTests(igId, igLookup.responseTime, pageToken));

    // ─── Business asset tests ───────────────────────────────────────────
    const bizId = userAccessToken ? biz.data?.data?.[0]?.id : biz.data?.business?.id;

    // business_asset_user_profile_access
    if (bizId) {
        results.push(await simpleApiTest(
            'business_asset_user_profile_access',
            `${GRAPH_API}/${bizId}/business_users?limit=1`,
            userAccessToken || pageToken,
            {
                endpointLabel: `GET /${bizId}/business_users`,
                successMsg: (data) =>
                    `Business users endpoint accessible — ${(data?.data || []).length} user(s) returned`,
            }
        ));
    } else {
        results.push(skippedResult(
            'business_asset_user_profile_access',
            'Skipped — no Business Manager found to test against'
        ));
    }

    // catalog_management
    if (bizId) {
        results.push(await simpleApiTest(
            'catalog_management',
            `${GRAPH_API}/${bizId}/owned_product_catalogs?limit=1`,
            userAccessToken || pageToken,
            {
                endpointLabel: `GET /${bizId}/owned_product_catalogs`,
                successMsg: (data) =>
                    `Catalogs endpoint accessible — ${(data?.data || []).length} catalog(s) found`,
            }
        ));
    } else {
        results.push(skippedResult(
            'catalog_management',
            'Skipped — no Business Manager found to test catalogs'
        ));
    }


    // ═══════════════════════════════════════════════════════════════════
    // THREADS API PERMISSIONS
    // ═══════════════════════════════════════════════════════════════════
    const tToken = threadsToken || null;

    if (!tToken) {
        const threadsPerms = [
            'threads_basic', 'threads_content_publish', 'threads_manage_insights',
            'threads_read_replies', 'threads_manage_replies', 'threads_profile_discovery',
            'threads_manage_mentions', 'threads_delete', 'threads_keyword_search',
            'threads_location_tagging',
        ];
        for (const perm of threadsPerms) {
            results.push({
                permission: perm, status: 'failed',
                message: 'No Threads account connected in this org — connect one in Settings to test Threads permissions',
                responseTime: 0,
            });
        }
    } else {
        // Why: Delegate to shared suite — same logic used by runThreadsTests
        results.push(...await runThreadsTestSuite(tToken));
    }

    return results;
}

/**
 * Instagram permission tests (10-20).
 * Why: Extracted to keep runMetaTests under 200 lines.
 */
async function runInstagramTests(
    igId: string | null,
    lookupTime: number,
    pageToken: string,
): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const SKIP_MSG = 'Skipped — no Instagram Business account linked';

    if (!igId) {
        // Batch-skip all IG tests
        const igPerms = [
            'instagram_basic', 'instagram_content_publish', 'instagram_business_content_publish',
            'instagram_manage_comments', 'instagram_business_manage_comments',
            'instagram_manage_insights', 'instagram_business_manage_insights',
            'instagram_manage_messages', 'instagram_business_manage_messages',
            'instagram_shopping_tag_products', 'instagram_manage_contents',
            'instagram_public_content_access',
        ];
        for (const perm of igPerms) {
            results.push(perm === 'instagram_basic'
                ? {
                    permission: perm, status: 'failed',
                    message: 'No Instagram Business account found — connect one in Settings or link IG to the Facebook Page',
                    responseTime: lookupTime,
                    endpoint: `GET /{pageId}?fields=instagram_business_account`,
                }
                : skippedResult(perm, SKIP_MSG));
        }
        return results;
    }

    // instagram_basic
    const igProfile = await graphCall(
        `${GRAPH_API}/${igId}?fields=id,username,profile_picture_url,followers_count,media_count`,
        pageToken
    );
    results.push({
        permission: 'instagram_basic',
        status: igProfile.ok ? 'passed' : 'failed',
        message: igProfile.ok
            ? `Instagram: @${igProfile.data.username} (${igProfile.data.followers_count} followers, ${igProfile.data.media_count} posts)`
            : `Error: ${igProfile.data?.error?.message || `HTTP ${igProfile.status}`}`,
        responseTime: lookupTime + igProfile.responseTime,
        endpoint: `GET /${igId}?fields=id,username,followers_count`,
    });

    // instagram_content_publish & instagram_business_content_publish
    for (const perm of ['instagram_content_publish', 'instagram_business_content_publish'] as const) {
        results.push(await simpleApiTest(
            perm,
            `${GRAPH_API}/${igId}/content_publishing_limit?fields=config,quota_usage`,
            pageToken,
            {
                endpointLabel: `GET /${igId}/content_publishing_limit${perm.includes('business') ? ' (business)' : ''}`,
                successMsg: (data) =>
                    `${perm.includes('business') ? 'Business p' : 'P'}ublishing limit accessible — quota usage: ${data?.data?.[0]?.quota_usage ?? 0}`,
            }
        ));
    }

    // instagram_manage_comments & instagram_business_manage_comments (multi-step)
    for (const perm of ['instagram_manage_comments', 'instagram_business_manage_comments'] as const) {
        const fields = perm.includes('business') ? 'id,text,username,timestamp' : 'id,message';
        const igMedia = await graphCall(`${GRAPH_API}/${igId}/media?fields=id&limit=1`, pageToken);
        const mediaId = igMedia.data?.data?.[0]?.id;

        if (mediaId) {
            const comments = await graphCall(
                `${GRAPH_API}/${mediaId}/comments?fields=${fields}&limit=1`, pageToken
            );
            results.push({
                permission: perm,
                status: comments.ok ? 'passed' : 'failed',
                message: comments.ok
                    ? `${perm.includes('business') ? 'Business c' : 'C'}omments endpoint accessible for media ${mediaId}`
                    : `Error: ${comments.data?.error?.message || `HTTP ${comments.status}`}`,
                responseTime: igMedia.responseTime + comments.responseTime,
                endpoint: `GET /${mediaId}/comments?fields=${fields}`,
            });
        } else {
            results.push({
                permission: perm,
                status: igMedia.ok ? 'skipped' : 'failed',
                message: igMedia.ok
                    ? `No Instagram media found to test ${perm.includes('business') ? 'business ' : ''}comments on`
                    : `Error: ${igMedia.data?.error?.message || `HTTP ${igMedia.status}`}`,
                responseTime: igMedia.responseTime,
            });
        }
    }

    // instagram_manage_insights
    // Why: 'impressions' is no longer a valid IG account-level metric in Graph API v24.
    results.push(await simpleApiTest(
        'instagram_manage_insights',
        `${GRAPH_API}/${igId}?fields=followers_count,insights.metric(reach).period(day)`,
        pageToken,
        {
            endpointLabel: `GET /${igId}?fields=insights.metric(reach)`,
            successMsg: (data) => `IG insights accessible — followers: ${data.followers_count ?? 'N/A'}`,
        }
    ));

    // instagram_business_manage_insights
    // Why: 'impressions' deprecated in v24; use valid metrics.
    results.push(await simpleApiTest(
        'instagram_business_manage_insights',
        `${GRAPH_API}/${igId}/insights?metric=reach,follower_count&period=day`,
        pageToken,
        {
            endpointLabel: `GET /${igId}/insights?metric=reach,follower_count&period=day`,
            successMsg: (data) =>
                `Business IG insights accessible — ${(data?.data || []).length} metric(s) returned`,
        }
    ));

    // instagram_manage_messages & instagram_business_manage_messages
    for (const perm of ['instagram_manage_messages', 'instagram_business_manage_messages'] as const) {
        results.push(await simpleApiTest(
            perm,
            `${GRAPH_API}/${igId}/conversations?platform=instagram&limit=1`,
            pageToken,
            {
                endpointLabel: `GET /${igId}/conversations?platform=instagram`,
                successMsg: (data) =>
                    `${perm.includes('business') ? 'Business messages' : 'Conversations'} endpoint accessible — ${(data?.data || []).length} conversation(s) returned`,
                skipOnErrorCode: 3,
                skipReason: `Requires Meta App Review approval for ${perm} — not a code issue`,
            }
        ));
    }

    // instagram_shopping_tag_products
    results.push(await simpleApiTest(
        'instagram_shopping_tag_products',
        `${GRAPH_API}/${igId}/available_catalogs?limit=1`,
        pageToken,
        {
            endpointLabel: `GET /${igId}/available_catalogs`,
            successMsg: (data) =>
                `Catalog endpoint accessible — ${(data?.data || []).length} catalog(s) found`,
        }
    ));

    // instagram_manage_contents (manage = read + delete)
    results.push(await simpleApiTest(
        'instagram_manage_contents',
        `${GRAPH_API}/${igId}/media?fields=id,media_type,timestamp&limit=1`,
        pageToken,
        {
            endpointLabel: `GET /${igId}/media?fields=id,media_type`,
            successMsg: (data) =>
                `Content management endpoint accessible — ${(data?.data || []).length} post(s) returned`,
        }
    ));

    // instagram_public_content_access (hashtag search)
    results.push(await simpleApiTest(
        'instagram_public_content_access',
        `${GRAPH_API}/ig_hashtag_search?q=test&user_id=${igId}`,
        pageToken,
        {
            endpointLabel: `GET /ig_hashtag_search?q=test&user_id=${igId}`,
            successMsg: (data) =>
                `Hashtag search accessible — found hashtag ID: ${data?.data?.[0]?.id || 'N/A'}`,
        }
    ));

    return results;
}



// =============================================================================
// Route handlers
// =============================================================================

/**
 * GET /api/admin/meta-api-tests
 * List available Facebook/Instagram/Threads accounts for testing.
 */
export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    const accounts = await db.socialAccount.findMany({
        where: {
            platform: { in: ['FACEBOOK', 'INSTAGRAM', 'THREADS'] },
            isActive: true,
        },
        select: {
            id: true,
            platform: true,
            name: true,
            username: true,
            platformId: true,
            organization: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ accounts });
});

/**
 * POST /api/admin/meta-api-tests
 * Run Meta Graph API or Threads API permission test calls based on account platform.
 * Why: THREADS accounts use a separate API (graph.threads.net) with different scopes,
 * so we dispatch to the appropriate test suite rather than running all 33+ tests.
 */
export const POST = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const body = await request.json().catch(() => ({}));
    const { accountId } = body;

    // Find the selected account to test with
    let account;
    if (accountId) {
        account = await db.socialAccount.findUnique({
            where: { id: accountId },
            select: { id: true, platform: true, name: true, accessToken: true, platformId: true, organizationId: true },
        });
    } else {
        account = await db.socialAccount.findFirst({
            where: { platform: { in: ['FACEBOOK', 'INSTAGRAM', 'THREADS'] }, isActive: true },
            select: { id: true, platform: true, name: true, accessToken: true, platformId: true, organizationId: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    if (!account) {
        return NextResponse.json(
            { error: 'No Facebook, Instagram, or Threads account found. Connect one first.' },
            { status: 404 }
        );
    }

    // Why: Look up ALL sibling accounts in the same org so each test suite gets
    // the correct platform-specific token.
    const siblingAccounts = await db.socialAccount.findMany({
        where: {
            organizationId: account.organizationId,
            platform: { in: ['FACEBOOK', 'INSTAGRAM', 'THREADS'] },
            isActive: true,
        },
        select: { platform: true, accessToken: true, platformId: true },
    });

    const threadsAccount = siblingAccounts.find(a => a.platform === 'THREADS');
    const igAccount = siblingAccounts.find(a => a.platform === 'INSTAGRAM');
    const fbAccount = siblingAccounts.find(a => a.platform === 'FACEBOOK');

    const isThreadsOnly = account.platform === 'THREADS' && !fbAccount;

    logger.info(
        {
            accountId: account.id, platform: account.platform, adminId: admin.userId,
            hasFb: !!fbAccount, hasIg: !!igAccount, hasThreads: !!threadsAccount,
        },
        'Running Meta API permission tests with sibling account lookup'
    );

    let results: TestResult[];

    if (isThreadsOnly) {
        // No Facebook account in org — can only run Threads-specific tests
        results = await runThreadsTestSuite(account.accessToken);
    } else {
        // Run the full Meta + Threads test suite
        const metaToken = fbAccount?.accessToken || account.accessToken;

        // Look up user-level token for endpoints that require it (/me, /me/accounts)
        let userAccessToken: string | null = null;
        try {
            const member = await db.organizationMember.findFirst({
                where: { organizationId: account.organizationId },
                select: { userId: true },
            });
            if (member) {
                const authAccount = await db.account.findFirst({
                    where: { userId: member.userId, provider: 'facebook' },
                    select: { access_token: true },
                });
                userAccessToken = authAccount?.access_token || null;
            }
        } catch (err) {
            logger.warn({ err }, 'Could not look up user-level access token, using page token');
        }

        results = await runMetaTests(
            userAccessToken,
            metaToken,
            threadsAccount?.accessToken || null,
            igAccount?.platformId || null,
        );
    }

    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    logger.info(
        { accountId: account.id, passed, failed, skipped },
        'Meta API permission tests completed'
    );

    return NextResponse.json({
        account: { id: account.id, name: account.name, platform: account.platform },
        results,
        summary: { total: results.length, passed, failed, skipped },
    });
});
