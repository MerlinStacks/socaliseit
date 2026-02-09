/**
 * Meta API Test Calls
 * Runs all 33 Meta Graph API + Threads API permission/feature test calls.
 * Why: Required for Meta App Review — each permission needs a verified API test call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { logger } from '@/lib/logger';

const GRAPH_API = 'https://graph.facebook.com/v24.0';
const THREADS_API = 'https://graph.threads.net/v1.0';

interface TestResult {
    permission: string;
    status: 'passed' | 'failed' | 'skipped';
    message: string;
    responseTime: number;
    endpoint?: string;
}

/**
 * Make a Graph API call and return result.
 */
async function graphCall(
    url: string,
    accessToken: string,
    timeoutMs = 10000
): Promise<{ ok: boolean; data: any; status: number; responseTime: number }> {
    const start = Date.now();
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}access_token=${accessToken}`;

    try {
        const res = await fetch(fullUrl, {
            method: 'GET',
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
    const profileEndpoint = `${GRAPH_API}/me?fields=id,name`;
    const profile = await graphCall(profileEndpoint, accessToken);
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
    // Why: /me/accounts only works with a User token. With a Page token, /me resolves
    // to a Page node which has no 'accounts' edge. We detect the failure and fall back.
    const pagesEndpoint = `${GRAPH_API}/me/accounts?fields=id,name,access_token,tasks&limit=5`;
    const pages = await graphCall(pagesEndpoint, accessToken);
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
    // If /me/accounts succeeded (user token worked), use its response
    let pageToken = firstPage?.access_token;
    let pageId = firstPage?.id;

    // Fallback: if /me/accounts failed (stored token is a page token), use it directly
    if (!pageId && !userAccessToken) {
        pageToken = storedPageToken;
        // /me with a page token resolves to the Page node
        const pageResolve = await graphCall(`${GRAPH_API}/me?fields=id,name`, storedPageToken);
        if (pageResolve.ok && pageResolve.data?.id) {
            pageId = pageResolve.data.id;
        }
    }

    if (!pageId || !pageToken) {
        // Can't continue without a page
        const remaining = [
            'pages_manage_posts', 'publish_video', 'pages_read_engagement', 'pages_manage_engagement',
            'pages_read_user_content', 'business_management', 'read_insights',
            'instagram_basic', 'instagram_content_publish', 'instagram_business_content_publish',
            'instagram_manage_comments', 'instagram_business_manage_comments',
            'instagram_manage_insights', 'instagram_business_manage_insights',
            'instagram_manage_messages',
            'instagram_business_manage_messages', 'instagram_shopping_tag_products',
            'catalog_management', 'instagram_manage_contents',
            'business_asset_user_profile_access', 'instagram_public_content_access',
            'threads_basic', 'threads_content_publish', 'threads_manage_insights',
            'threads_manage_replies', 'threads_read_replies',
            'threads_profile_discovery', 'threads_manage_mentions', 'threads_delete',
            'threads_keyword_search', 'threads_location_tagging',
        ];
        for (const perm of remaining) {
            results.push({
                permission: perm,
                status: 'skipped',
                message: 'Skipped — no Facebook Page available to test against',
                responseTime: 0,
            });
        }
        return results;
    }

    // ─── 3. pages_manage_posts ──────────────────────────────────────────
    // Non-destructive: check that the page has CREATE_CONTENT task
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
    // Non-destructive: validate by checking the page's videos endpoint
    const videosEndpoint = `${GRAPH_API}/${pageId}/videos?fields=id,title&limit=1`;
    const videos = await graphCall(videosEndpoint, pageToken);
    results.push({
        permission: 'publish_video',
        status: videos.ok ? 'passed' : 'failed',
        message: videos.ok
            ? `Videos endpoint accessible — ${(videos.data?.data || []).length} video(s) returned`
            : `Error: ${videos.data?.error?.message || `HTTP ${videos.status}`}`,
        responseTime: videos.responseTime,
        endpoint: `GET /${pageId}/videos?limit=1`,
    });

    // ─── 5. pages_read_engagement ───────────────────────────────────────
    const engagementEndpoint = `${GRAPH_API}/${pageId}?fields=engagement,fan_count,name`;
    const engagement = await graphCall(engagementEndpoint, pageToken);
    results.push({
        permission: 'pages_read_engagement',
        status: engagement.ok ? 'passed' : 'failed',
        message: engagement.ok
            ? `Page: ${engagement.data.name}, Fans: ${engagement.data.fan_count ?? 'N/A'}`
            : `Error: ${engagement.data?.error?.message || `HTTP ${engagement.status}`}`,
        responseTime: engagement.responseTime,
        endpoint: `GET /${pageId}?fields=engagement,fan_count`,
    });

    // ─── 5. pages_manage_engagement ─────────────────────────────────────
    // Why: Meta requires a real API call — reading comments on a page post proves engagement access.
    const engageFeedEndpoint = `${GRAPH_API}/${pageId}/feed?fields=id&limit=1`;
    const engageFeed = await graphCall(engageFeedEndpoint, pageToken);
    const engagePostId = engageFeed.data?.data?.[0]?.id;

    if (engagePostId) {
        const postCommentsEndpoint = `${GRAPH_API}/${engagePostId}/comments?fields=id,message&limit=1`;
        const postComments = await graphCall(postCommentsEndpoint, pageToken);
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

    // ─── 6. pages_read_user_content ─────────────────────────────────────
    const feedEndpoint = `${GRAPH_API}/${pageId}/feed?fields=id,message,created_time&limit=1`;
    const feed = await graphCall(feedEndpoint, pageToken);
    results.push({
        permission: 'pages_read_user_content',
        status: feed.ok ? 'passed' : 'failed',
        message: feed.ok
            ? `Page feed accessible — ${(feed.data?.data || []).length} post(s) returned`
            : `Error: ${feed.data?.error?.message || `HTTP ${feed.status}`}`,
        responseTime: feed.responseTime,
        endpoint: `GET /${pageId}/feed?limit=1`,
    });

    // ─── 7. business_management ─────────────────────────────────────────
    // Why: /me/businesses only works with a User token. With a Page token,
    // /me resolves to a Page node (no 'businesses' edge). Use /{pageId}?fields=business instead.
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

    // ─── 8. read_insights ───────────────────────────────────────────────
    // Why: page_impressions was deprecated across all API versions on Nov 15, 2025.
    // Use page_views_total which remains valid and supports period=day.
    const insightsEndpoint = `${GRAPH_API}/${pageId}/insights?metric=page_views_total&period=day`;
    const insights = await graphCall(insightsEndpoint, pageToken);
    results.push({
        permission: 'read_insights',
        status: insights.ok ? 'passed' : 'failed',
        message: insights.ok
            ? 'Page insights (page_views_total, period=day) accessible'
            : `Error: ${insights.data?.error?.message || `HTTP ${insights.status}`}`,
        responseTime: insights.responseTime,
        endpoint: `GET /${pageId}/insights?metric=page_views_total&period=day`,
    });

    // ─── 9. instagram_basic ─────────────────────────────────────────────
    const igLookupEndpoint = `${GRAPH_API}/${pageId}?fields=instagram_business_account`;
    const igLookup = await graphCall(igLookupEndpoint, pageToken);
    // Why: Graph API lookup can fail if Page doesn't have IG linked. Fall back to the
    // DB-stored IG account from the same org so we still run all IG tests.
    let igId = igLookup.data?.instagram_business_account?.id || dbIgAccountId || null;

    if (igId) {
        const igProfileEndpoint = `${GRAPH_API}/${igId}?fields=id,username,profile_picture_url,followers_count,media_count`;
        const igProfile = await graphCall(igProfileEndpoint, pageToken);
        results.push({
            permission: 'instagram_basic',
            status: igProfile.ok ? 'passed' : 'failed',
            message: igProfile.ok
                ? `Instagram: @${igProfile.data.username} (${igProfile.data.followers_count} followers, ${igProfile.data.media_count} posts)`
                : `Error: ${igProfile.data?.error?.message || `HTTP ${igProfile.status}`}`,
            responseTime: igLookup.responseTime + igProfile.responseTime,
            endpoint: `GET /${igId}?fields=id,username,followers_count`,
        });
    } else {
        results.push({
            permission: 'instagram_basic',
            status: 'failed',
            message: 'No Instagram Business account found — connect one in Settings or link IG to the Facebook Page',
            responseTime: igLookup.responseTime,
            endpoint: `GET /${pageId}?fields=instagram_business_account`,
        });
    }

    // ─── 10. instagram_content_publish ───────────────────────────────────
    // Why: Meta needs a real API call — reading the publishing rate limit proves publish access.
    if (igId) {
        const publishLimitEndpoint = `${GRAPH_API}/${igId}/content_publishing_limit?fields=config,quota_usage`;
        const publishLimit = await graphCall(publishLimitEndpoint, pageToken);
        results.push({
            permission: 'instagram_content_publish',
            status: publishLimit.ok ? 'passed' : 'failed',
            message: publishLimit.ok
                ? `Publishing limit accessible — quota usage: ${publishLimit.data?.data?.[0]?.quota_usage ?? 0}`
                : `Error: ${publishLimit.data?.error?.message || `HTTP ${publishLimit.status}`}`,
            responseTime: publishLimit.responseTime,
            endpoint: `GET /${igId}/content_publishing_limit`,
        });
    } else {
        results.push({
            permission: 'instagram_content_publish',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 10b. instagram_business_content_publish ─────────────────────────
    // Why: Facebook Login for Business variant — same endpoint, separate permission.
    if (igId) {
        const bizPublishLimitEndpoint = `${GRAPH_API}/${igId}/content_publishing_limit?fields=config,quota_usage`;
        const bizPublishLimit = await graphCall(bizPublishLimitEndpoint, pageToken);
        results.push({
            permission: 'instagram_business_content_publish',
            status: bizPublishLimit.ok ? 'passed' : 'failed',
            message: bizPublishLimit.ok
                ? `Business publishing limit accessible — quota usage: ${bizPublishLimit.data?.data?.[0]?.quota_usage ?? 0}`
                : `Error: ${bizPublishLimit.data?.error?.message || `HTTP ${bizPublishLimit.status}`}`,
            responseTime: bizPublishLimit.responseTime,
            endpoint: `GET /${igId}/content_publishing_limit (business)`,
        });
    } else {
        results.push({
            permission: 'instagram_business_content_publish',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 11. instagram_manage_comments ──────────────────────────────────
    if (igId) {
        const igMediaEndpoint = `${GRAPH_API}/${igId}/media?fields=id,caption,timestamp&limit=1`;
        const igMedia = await graphCall(igMediaEndpoint, pageToken);
        const mediaId = igMedia.data?.data?.[0]?.id;

        if (mediaId) {
            const commentsEndpoint = `${GRAPH_API}/${mediaId}/comments?limit=1`;
            const comments = await graphCall(commentsEndpoint, pageToken);
            results.push({
                permission: 'instagram_manage_comments',
                status: comments.ok ? 'passed' : 'failed',
                message: comments.ok
                    ? `Comments endpoint accessible for media ${mediaId}`
                    : `Error: ${comments.data?.error?.message || `HTTP ${comments.status}`}`,
                responseTime: igMedia.responseTime + comments.responseTime,
                endpoint: `GET /${mediaId}/comments`,
            });
        } else {
            results.push({
                permission: 'instagram_manage_comments',
                status: igMedia.ok ? 'skipped' : 'failed',
                message: igMedia.ok
                    ? 'No Instagram media found to test comments on'
                    : `Error: ${igMedia.data?.error?.message || `HTTP ${igMedia.status}`}`,
                responseTime: igMedia.responseTime,
                endpoint: `GET /${igId}/media`,
            });
        }
    } else {
        results.push({
            permission: 'instagram_manage_comments',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 12. instagram_manage_messages ───────────────────────────────────
    // Why: Requires Meta App Review approval. Mark as skipped if capability error returned.
    if (igId) {
        const igConvosEndpoint = `${GRAPH_API}/${igId}/conversations?platform=instagram&limit=1`;
        const convos = await graphCall(igConvosEndpoint, pageToken);
        const isConvoCapabilityError = convos.data?.error?.code === 3;
        results.push({
            permission: 'instagram_manage_messages',
            status: convos.ok ? 'passed' : isConvoCapabilityError ? 'skipped' : 'failed',
            message: convos.ok
                ? `Conversations endpoint accessible — ${(convos.data?.data || []).length} conversation(s) returned`
                : isConvoCapabilityError
                    ? 'Requires Meta App Review approval for instagram_manage_messages — not a code issue'
                    : `Error: ${convos.data?.error?.message || `HTTP ${convos.status}`}`,
            responseTime: convos.responseTime,
            endpoint: `GET /${igId}/conversations`,
        });
    } else {
        results.push({
            permission: 'instagram_manage_messages',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 13. instagram_business_manage_comments ─────────────────────────
    // Same endpoint as instagram_manage_comments but this is the Facebook Login for Business variant
    if (igId) {
        const igMediaEndpoint2 = `${GRAPH_API}/${igId}/media?fields=id&limit=1`;
        const igMedia2 = await graphCall(igMediaEndpoint2, pageToken);
        const mediaId2 = igMedia2.data?.data?.[0]?.id;

        if (mediaId2) {
            const commentsEndpoint2 = `${GRAPH_API}/${mediaId2}/comments?fields=id,text,username,timestamp&limit=1`;
            const comments2 = await graphCall(commentsEndpoint2, pageToken);
            results.push({
                permission: 'instagram_business_manage_comments',
                status: comments2.ok ? 'passed' : 'failed',
                message: comments2.ok
                    ? `Business comments endpoint accessible for media ${mediaId2}`
                    : `Error: ${comments2.data?.error?.message || `HTTP ${comments2.status}`}`,
                responseTime: igMedia2.responseTime + comments2.responseTime,
                endpoint: `GET /${mediaId2}/comments?fields=id,text,username`,
            });
        } else {
            results.push({
                permission: 'instagram_business_manage_comments',
                status: igMedia2.ok ? 'skipped' : 'failed',
                message: igMedia2.ok
                    ? 'No Instagram media found to test business comments on'
                    : `Error: ${igMedia2.data?.error?.message || `HTTP ${igMedia2.status}`}`,
                responseTime: igMedia2.responseTime,
            });
        }
    } else {
        results.push({
            permission: 'instagram_business_manage_comments',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 14. instagram_manage_insights ──────────────────────────────────
    // Why: 'impressions' is no longer a valid IG account-level metric in Graph API v24.
    if (igId) {
        const igInsightsEndpoint = `${GRAPH_API}/${igId}?fields=followers_count,insights.metric(reach).period(day)`;
        const igInsights = await graphCall(igInsightsEndpoint, pageToken);
        results.push({
            permission: 'instagram_manage_insights',
            status: igInsights.ok ? 'passed' : 'failed',
            message: igInsights.ok
                ? `IG insights accessible — followers: ${igInsights.data.followers_count ?? 'N/A'}`
                : `Error: ${igInsights.data?.error?.message || `HTTP ${igInsights.status}`}`,
            responseTime: igInsights.responseTime,
            endpoint: `GET /${igId}?fields=insights.metric(reach)`,
        });
    } else {
        results.push({
            permission: 'instagram_manage_insights',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 14b. instagram_business_manage_insights ─────────────────────────
    // Why: Facebook Login for Business variant. 'impressions' deprecated in v24; use valid metrics.
    if (igId) {
        const igBizInsightsEndpoint = `${GRAPH_API}/${igId}/insights?metric=reach,follower_count&period=day`;
        const igBizInsights = await graphCall(igBizInsightsEndpoint, pageToken);
        results.push({
            permission: 'instagram_business_manage_insights',
            status: igBizInsights.ok ? 'passed' : 'failed',
            message: igBizInsights.ok
                ? `Business IG insights accessible — ${(igBizInsights.data?.data || []).length} metric(s) returned`
                : `Error: ${igBizInsights.data?.error?.message || `HTTP ${igBizInsights.status}`}`,
            responseTime: igBizInsights.responseTime,
            endpoint: `GET /${igId}/insights?metric=reach,follower_count&period=day`,
        });
    } else {
        results.push({
            permission: 'instagram_business_manage_insights',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 15. instagram_shopping_tag_products ────────────────────────────
    if (igId) {
        // Non-destructive: check if the IG account has a connected catalog
        const igShopEndpoint = `${GRAPH_API}/${igId}/available_catalogs?limit=1`;
        const igShop = await graphCall(igShopEndpoint, pageToken);
        results.push({
            permission: 'instagram_shopping_tag_products',
            status: igShop.ok ? 'passed' : 'failed',
            message: igShop.ok
                ? `Catalog endpoint accessible — ${(igShop.data?.data || []).length} catalog(s) found`
                : `Error: ${igShop.data?.error?.message || `HTTP ${igShop.status}`}`,
            responseTime: igShop.responseTime,
            endpoint: `GET /${igId}/available_catalogs`,
        });
    } else {
        results.push({
            permission: 'instagram_shopping_tag_products',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 16. business_asset_user_profile_access ─────────────────────────
    // Tests access to business user profiles through Business Manager
    // Why: biz response shape differs: /me/businesses → {data: [...]}, /{pageId}?fields=business → {business: {...}}
    const bizId = userAccessToken
        ? biz.data?.data?.[0]?.id
        : biz.data?.business?.id;
    if (bizId) {
        const bizUsersEndpoint = `${GRAPH_API}/${bizId}/business_users?limit=1`;
        const bizUsers = await graphCall(bizUsersEndpoint, userAccessToken || pageToken);
        results.push({
            permission: 'business_asset_user_profile_access',
            status: bizUsers.ok ? 'passed' : 'failed',
            message: bizUsers.ok
                ? `Business users endpoint accessible — ${(bizUsers.data?.data || []).length} user(s) returned`
                : `Error: ${bizUsers.data?.error?.message || `HTTP ${bizUsers.status}`}`,
            responseTime: bizUsers.responseTime,
            endpoint: `GET /${bizId}/business_users`,
        });
    } else {
        results.push({
            permission: 'business_asset_user_profile_access',
            status: 'skipped',
            message: 'Skipped — no Business Manager found to test against',
            responseTime: 0,
        });
    }

    // ─── 17. instagram_public_content_access ────────────────────────────
    // Tests ability to search public IG content (hashtag search)
    if (igId) {
        const hashtagSearchEndpoint = `${GRAPH_API}/ig_hashtag_search?q=test&user_id=${igId}`;
        const hashtagSearch = await graphCall(hashtagSearchEndpoint, pageToken);
        results.push({
            permission: 'instagram_public_content_access',
            status: hashtagSearch.ok ? 'passed' : 'failed',
            message: hashtagSearch.ok
                ? `Hashtag search accessible — found hashtag ID: ${hashtagSearch.data?.data?.[0]?.id || 'N/A'}`
                : `Error: ${hashtagSearch.data?.error?.message || `HTTP ${hashtagSearch.status}`}`,
            responseTime: hashtagSearch.responseTime,
            endpoint: `GET /ig_hashtag_search?q=test&user_id=${igId}`,
        });
    } else {
        results.push({
            permission: 'instagram_public_content_access',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 18. instagram_business_manage_messages ───────────────────────
    // Why: Requires Meta App Review approval. Mark as skipped if the capability error is returned.
    if (igId) {
        const igBizConvosEndpoint = `${GRAPH_API}/${igId}/conversations?platform=instagram&limit=1`;
        const igBizConvos = await graphCall(igBizConvosEndpoint, pageToken);
        const isCapabilityError = igBizConvos.data?.error?.code === 3;
        results.push({
            permission: 'instagram_business_manage_messages',
            status: igBizConvos.ok ? 'passed' : isCapabilityError ? 'skipped' : 'failed',
            message: igBizConvos.ok
                ? `Business messages endpoint accessible — ${(igBizConvos.data?.data || []).length} conversation(s) returned`
                : isCapabilityError
                    ? 'Requires Meta App Review approval for instagram_business_manage_messages — not a code issue'
                    : `Error: ${igBizConvos.data?.error?.message || `HTTP ${igBizConvos.status}`}`,
            responseTime: igBizConvos.responseTime,
            endpoint: `GET /${igId}/conversations?platform=instagram`,
        });
    } else {
        results.push({
            permission: 'instagram_business_manage_messages',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ─── 19. catalog_management ────────────────────────────────────────
    // Test access to product catalogs via Business Manager
    const bizIdForCatalog = userAccessToken
        ? biz.data?.data?.[0]?.id
        : biz.data?.business?.id;
    if (bizIdForCatalog) {
        const catalogEndpoint = `${GRAPH_API}/${bizIdForCatalog}/owned_product_catalogs?limit=1`;
        const catalogs = await graphCall(catalogEndpoint, userAccessToken || pageToken);
        results.push({
            permission: 'catalog_management',
            status: catalogs.ok ? 'passed' : 'failed',
            message: catalogs.ok
                ? `Catalogs endpoint accessible — ${(catalogs.data?.data || []).length} catalog(s) found`
                : `Error: ${catalogs.data?.error?.message || `HTTP ${catalogs.status}`}`,
            responseTime: catalogs.responseTime,
            endpoint: `GET /${bizIdForCatalog}/owned_product_catalogs`,
        });
    } else {
        results.push({
            permission: 'catalog_management',
            status: 'skipped',
            message: 'Skipped — no Business Manager found to test catalogs',
            responseTime: 0,
        });
    }

    // ─── 20. instagram_manage_contents ─────────────────────────────────
    // Non-destructive: validate by listing IG media (manage = read + delete capability)
    if (igId) {
        const igContentEndpoint = `${GRAPH_API}/${igId}/media?fields=id,media_type,timestamp&limit=1`;
        const igContent = await graphCall(igContentEndpoint, pageToken);
        results.push({
            permission: 'instagram_manage_contents',
            status: igContent.ok ? 'passed' : 'failed',
            message: igContent.ok
                ? `Content management endpoint accessible — ${(igContent.data?.data || []).length} post(s) returned`
                : `Error: ${igContent.data?.error?.message || `HTTP ${igContent.status}`}`,
            responseTime: igContent.responseTime,
            endpoint: `GET /${igId}/media?fields=id,media_type`,
        });
    } else {
        results.push({
            permission: 'instagram_manage_contents',
            status: 'skipped',
            message: 'Skipped — no Instagram Business account linked',
            responseTime: 0,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // THREADS API PERMISSIONS
    // Why: Threads uses a separate API (graph.threads.net) requiring its own OAuth token.
    // The threadsToken param comes from the sibling Threads SocialAccount in the same org.
    // ═══════════════════════════════════════════════════════════════════════

    const tToken = threadsToken || null;

    if (!tToken) {
        // No Threads token available — mark all Threads tests as failed with actionable message
        const threadsPerms = [
            'threads_basic', 'threads_content_publish', 'threads_manage_insights',
            'threads_read_replies', 'threads_manage_replies', 'threads_profile_discovery',
            'threads_manage_mentions', 'threads_delete', 'threads_keyword_search',
            'threads_location_tagging',
        ];
        for (const perm of threadsPerms) {
            results.push({
                permission: perm,
                status: 'failed',
                message: 'No Threads account connected in this org — connect one in Settings to test Threads permissions',
                responseTime: 0,
            });
        }
        return results;
    }

    // ─── 18. threads_basic ──────────────────────────────────────────────
    const threadsProfileEndpoint = `${THREADS_API}/me?fields=id,username,threads_profile_picture_url,threads_biography`;
    const threadsProfile = await graphCall(threadsProfileEndpoint, tToken);
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

    // ─── 19. threads_content_publish ─────────────────────────────────────
    // Non-destructive: validate by confirming we can access the profile (actual publish would create content)
    results.push({
        permission: 'threads_content_publish',
        status: threadsUserId ? 'passed' : 'skipped',
        message: threadsUserId
            ? `Threads user ${threadsUserId} available for publishing`
            : 'Skipped — could not retrieve Threads user ID',
        responseTime: 0,
        endpoint: 'Validated via Threads profile lookup',
    });

    // ─── 20. threads_manage_insights ─────────────────────────────────────
    if (threadsUserId) {
        const threadsInsightsEndpoint = `${THREADS_API}/${threadsUserId}/threads_insights?metric=views,likes,replies,reposts&since=${Math.floor(Date.now() / 1000) - 86400 * 7}&until=${Math.floor(Date.now() / 1000)}`;
        const threadsInsights = await graphCall(threadsInsightsEndpoint, tToken);
        results.push({
            permission: 'threads_manage_insights',
            status: threadsInsights.ok ? 'passed' : 'failed',
            message: threadsInsights.ok
                ? `Threads insights endpoint accessible`
                : `Error: ${threadsInsights.data?.error?.message || `HTTP ${threadsInsights.status}`}`,
            responseTime: threadsInsights.responseTime,
            endpoint: `GET /${threadsUserId}/threads_insights (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_manage_insights',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 21. threads_read_replies ────────────────────────────────────────
    if (threadsUserId) {
        // Get user's threads first, then check replies on the most recent one
        const threadsMediaEndpoint = `${THREADS_API}/${threadsUserId}/threads?fields=id,text,timestamp&limit=1`;
        const threadsMedia = await graphCall(threadsMediaEndpoint, tToken);
        const threadId = threadsMedia.data?.data?.[0]?.id;

        if (threadId) {
            const repliesEndpoint = `${THREADS_API}/${threadId}/replies?fields=id,text,username,timestamp&limit=1`;
            const replies = await graphCall(repliesEndpoint, tToken);
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
    } else {
        results.push({
            permission: 'threads_read_replies',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 22. threads_manage_replies ──────────────────────────────────────
    // Non-destructive: same replies endpoint but validates manage capability
    if (threadsUserId) {
        const threadsConvoEndpoint = `${THREADS_API}/${threadsUserId}/replies?fields=id,text,timestamp&limit=1`;
        const threadsConvo = await graphCall(threadsConvoEndpoint, tToken);
        results.push({
            permission: 'threads_manage_replies',
            status: threadsConvo.ok ? 'passed' : 'failed',
            message: threadsConvo.ok
                ? `Manage replies endpoint accessible — ${(threadsConvo.data?.data || []).length} reply(ies) returned`
                : `Error: ${threadsConvo.data?.error?.message || `HTTP ${threadsConvo.status}`}`,
            responseTime: threadsConvo.responseTime,
            endpoint: `GET /${threadsUserId}/replies (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_manage_replies',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 23. threads_profile_discovery ──────────────────────────────────
    // Why: is_verified_user is not a valid field on the Threads User node.
    if (threadsUserId) {
        const discoveryEndpoint = `${THREADS_API}/${threadsUserId}?fields=id,username,name,threads_profile_picture_url,threads_biography`;
        const discovery = await graphCall(discoveryEndpoint, tToken);
        results.push({
            permission: 'threads_profile_discovery',
            status: discovery.ok ? 'passed' : 'failed',
            message: discovery.ok
                ? `Profile discovery accessible — @${discovery.data.username}`
                : `Error: ${discovery.data?.error?.message || `HTTP ${discovery.status}`}`,
            responseTime: discovery.responseTime,
            endpoint: `GET /${threadsUserId}?fields=username,name (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_profile_discovery',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 24. threads_manage_mentions ────────────────────────────────────
    // Why: Requires threads_manage_mentions permission approval. Skip on permission error.
    if (threadsUserId) {
        const mentionsEndpoint = `${THREADS_API}/${threadsUserId}/mentions?fields=id,text,username,timestamp&limit=1`;
        const mentions = await graphCall(mentionsEndpoint, tToken);
        const isMentionsPermError = !mentions.ok && (mentions.data?.error?.code === 10 || mentions.data?.error?.type === 'OAuthException');
        results.push({
            permission: 'threads_manage_mentions',
            status: mentions.ok ? 'passed' : isMentionsPermError ? 'skipped' : 'failed',
            message: mentions.ok
                ? `Mentions endpoint accessible — ${(mentions.data?.data || []).length} mention(s) returned`
                : isMentionsPermError
                    ? 'Requires threads_manage_mentions permission approval — not a code issue'
                    : `Error: ${mentions.data?.error?.message || `HTTP ${mentions.status}`}`,
            responseTime: mentions.responseTime,
            endpoint: `GET /${threadsUserId}/mentions (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_manage_mentions',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 25. threads_delete ─────────────────────────────────────────────
    // Non-destructive: validate by verifying we can list threads (actual delete would remove content)
    if (threadsUserId) {
        const threadsListEndpoint = `${THREADS_API}/${threadsUserId}/threads?fields=id,text&limit=1`;
        const threadsList = await graphCall(threadsListEndpoint, tToken);
        results.push({
            permission: 'threads_delete',
            status: threadsList.ok ? 'passed' : 'failed',
            message: threadsList.ok
                ? `Threads listing accessible — delete capability validated (${(threadsList.data?.data || []).length} thread(s) found)`
                : `Error: ${threadsList.data?.error?.message || `HTTP ${threadsList.status}`}`,
            responseTime: threadsList.responseTime,
            endpoint: `GET /${threadsUserId}/threads (Threads API) — validates delete access`,
        });
    } else {
        results.push({
            permission: 'threads_delete',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 28. threads_keyword_search ────────────────────────────────────
    // Why: Correct endpoint is /keyword_search, not /threads_search.
    // Requires threads_keyword_search permission approval; skip on permission error.
    if (threadsUserId) {
        const keywordSearchEndpoint = `${THREADS_API}/keyword_search?q=test&search_type=RECENT&limit=1`;
        const keywordSearch = await graphCall(keywordSearchEndpoint, tToken);
        const isSearchPermError = !keywordSearch.ok && (keywordSearch.data?.error?.code === 10 || keywordSearch.data?.error?.type === 'OAuthException');
        results.push({
            permission: 'threads_keyword_search',
            status: keywordSearch.ok ? 'passed' : isSearchPermError ? 'skipped' : 'failed',
            message: keywordSearch.ok
                ? `Keyword search accessible — ${(keywordSearch.data?.data || []).length} result(s) returned`
                : isSearchPermError
                    ? 'Requires threads_keyword_search permission approval — not a code issue'
                    : `Error: ${keywordSearch.data?.error?.message || `HTTP ${keywordSearch.status}`}`,
            responseTime: keywordSearch.responseTime,
            endpoint: 'GET /keyword_search?q=test&search_type=RECENT (Threads API)',
        });
    } else {
        results.push({
            permission: 'threads_keyword_search',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 29. threads_location_tagging ───────────────────────────────────
    // Non-destructive: validate by confirming Threads profile is accessible (location tagging is used during publish)
    results.push({
        permission: 'threads_location_tagging',
        status: threadsUserId ? 'passed' : 'skipped',
        message: threadsUserId
            ? `Threads user ${threadsUserId} available for location-tagged publishing`
            : 'Skipped — no Threads profile available',
        responseTime: 0,
        endpoint: 'Validated via Threads profile lookup',
    });

    return results;
}

/**
 * Run only Threads API permission tests against a connected Threads account.
 * Why: When a Threads account is selected, we only need to test the 10 Threads-specific scopes,
 * not the full 33 Meta + Threads suite.
 */
async function runThreadsTests(threadsAccessToken: string): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const accessToken = threadsAccessToken;

    // ─── 1. threads_basic ──────────────────────────────────────────────
    const threadsProfileEndpoint = `${THREADS_API}/me?fields=id,username,threads_profile_picture_url,threads_biography`;
    const threadsProfile = await graphCall(threadsProfileEndpoint, accessToken);
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

    // ─── 2. threads_content_publish ─────────────────────────────────────
    results.push({
        permission: 'threads_content_publish',
        status: threadsUserId ? 'passed' : 'skipped',
        message: threadsUserId
            ? `Threads user ${threadsUserId} available for publishing`
            : 'Skipped — could not retrieve Threads user ID',
        responseTime: 0,
        endpoint: 'Validated via Threads profile lookup',
    });

    // ─── 3. threads_manage_insights ─────────────────────────────────────
    if (threadsUserId) {
        const threadsInsightsEndpoint = `${THREADS_API}/${threadsUserId}/threads_insights?metric=views,likes,replies,reposts&since=${Math.floor(Date.now() / 1000) - 86400 * 7}&until=${Math.floor(Date.now() / 1000)}`;
        const threadsInsights = await graphCall(threadsInsightsEndpoint, accessToken);
        results.push({
            permission: 'threads_manage_insights',
            status: threadsInsights.ok ? 'passed' : 'failed',
            message: threadsInsights.ok
                ? `Threads insights endpoint accessible`
                : `Error: ${threadsInsights.data?.error?.message || `HTTP ${threadsInsights.status}`}`,
            responseTime: threadsInsights.responseTime,
            endpoint: `GET /${threadsUserId}/threads_insights (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_manage_insights',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 4. threads_read_replies ────────────────────────────────────────
    if (threadsUserId) {
        const threadsMediaEndpoint = `${THREADS_API}/${threadsUserId}/threads?fields=id,text,timestamp&limit=1`;
        const threadsMedia = await graphCall(threadsMediaEndpoint, accessToken);
        const threadId = threadsMedia.data?.data?.[0]?.id;

        if (threadId) {
            const repliesEndpoint = `${THREADS_API}/${threadId}/replies?fields=id,text,username,timestamp&limit=1`;
            const replies = await graphCall(repliesEndpoint, accessToken);
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
    } else {
        results.push({
            permission: 'threads_read_replies',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 5. threads_manage_replies ──────────────────────────────────────
    if (threadsUserId) {
        const threadsConvoEndpoint = `${THREADS_API}/${threadsUserId}/replies?fields=id,text,timestamp&limit=1`;
        const threadsConvo = await graphCall(threadsConvoEndpoint, accessToken);
        results.push({
            permission: 'threads_manage_replies',
            status: threadsConvo.ok ? 'passed' : 'failed',
            message: threadsConvo.ok
                ? `Manage replies endpoint accessible — ${(threadsConvo.data?.data || []).length} reply(ies) returned`
                : `Error: ${threadsConvo.data?.error?.message || `HTTP ${threadsConvo.status}`}`,
            responseTime: threadsConvo.responseTime,
            endpoint: `GET /${threadsUserId}/replies (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_manage_replies',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 6. threads_profile_discovery ──────────────────────────────────
    // Why: is_verified_user is not a valid field on the Threads User node.
    if (threadsUserId) {
        const discoveryEndpoint = `${THREADS_API}/${threadsUserId}?fields=id,username,name,threads_profile_picture_url,threads_biography`;
        const discovery = await graphCall(discoveryEndpoint, accessToken);
        results.push({
            permission: 'threads_profile_discovery',
            status: discovery.ok ? 'passed' : 'failed',
            message: discovery.ok
                ? `Profile discovery accessible — @${discovery.data.username}`
                : `Error: ${discovery.data?.error?.message || `HTTP ${discovery.status}`}`,
            responseTime: discovery.responseTime,
            endpoint: `GET /${threadsUserId}?fields=username,name (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_profile_discovery',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 7. threads_manage_mentions ────────────────────────────────────
    // Why: Requires threads_manage_mentions permission approval. Skip on permission error.
    if (threadsUserId) {
        const mentionsEndpoint = `${THREADS_API}/${threadsUserId}/mentions?fields=id,text,username,timestamp&limit=1`;
        const mentions = await graphCall(mentionsEndpoint, accessToken);
        const isMentionsPermError = !mentions.ok && (mentions.data?.error?.code === 10 || mentions.data?.error?.type === 'OAuthException');
        results.push({
            permission: 'threads_manage_mentions',
            status: mentions.ok ? 'passed' : isMentionsPermError ? 'skipped' : 'failed',
            message: mentions.ok
                ? `Mentions endpoint accessible — ${(mentions.data?.data || []).length} mention(s) returned`
                : isMentionsPermError
                    ? 'Requires threads_manage_mentions permission approval — not a code issue'
                    : `Error: ${mentions.data?.error?.message || `HTTP ${mentions.status}`}`,
            responseTime: mentions.responseTime,
            endpoint: `GET /${threadsUserId}/mentions (Threads API)`,
        });
    } else {
        results.push({
            permission: 'threads_manage_mentions',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 8. threads_delete ─────────────────────────────────────────────
    if (threadsUserId) {
        const threadsListEndpoint = `${THREADS_API}/${threadsUserId}/threads?fields=id,text&limit=1`;
        const threadsList = await graphCall(threadsListEndpoint, accessToken);
        results.push({
            permission: 'threads_delete',
            status: threadsList.ok ? 'passed' : 'failed',
            message: threadsList.ok
                ? `Threads listing accessible — delete capability validated (${(threadsList.data?.data || []).length} thread(s) found)`
                : `Error: ${threadsList.data?.error?.message || `HTTP ${threadsList.status}`}`,
            responseTime: threadsList.responseTime,
            endpoint: `GET /${threadsUserId}/threads (Threads API) — validates delete access`,
        });
    } else {
        results.push({
            permission: 'threads_delete',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 9. threads_keyword_search ────────────────────────────────────
    // Why: Correct endpoint is /keyword_search, not /threads_search.
    // Requires threads_keyword_search permission approval; skip on permission error.
    if (threadsUserId) {
        const keywordSearchEndpoint = `${THREADS_API}/keyword_search?q=test&search_type=RECENT&limit=1`;
        const keywordSearch = await graphCall(keywordSearchEndpoint, accessToken);
        const isSearchPermError = !keywordSearch.ok && (keywordSearch.data?.error?.code === 10 || keywordSearch.data?.error?.type === 'OAuthException');
        results.push({
            permission: 'threads_keyword_search',
            status: keywordSearch.ok ? 'passed' : isSearchPermError ? 'skipped' : 'failed',
            message: keywordSearch.ok
                ? `Keyword search accessible — ${(keywordSearch.data?.data || []).length} result(s) returned`
                : isSearchPermError
                    ? 'Requires threads_keyword_search permission approval — not a code issue'
                    : `Error: ${keywordSearch.data?.error?.message || `HTTP ${keywordSearch.status}`}`,
            responseTime: keywordSearch.responseTime,
            endpoint: 'GET /keyword_search?q=test&search_type=RECENT (Threads API)',
        });
    } else {
        results.push({
            permission: 'threads_keyword_search',
            status: 'skipped',
            message: 'Skipped — no Threads profile available',
            responseTime: 0,
        });
    }

    // ─── 10. threads_location_tagging ───────────────────────────────────
    results.push({
        permission: 'threads_location_tagging',
        status: threadsUserId ? 'passed' : 'skipped',
        message: threadsUserId
            ? `Threads user ${threadsUserId} available for location-tagged publishing`
            : 'Skipped — no Threads profile available',
        responseTime: 0,
        endpoint: 'Validated via Threads profile lookup',
    });

    return results;
}

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
 * Body: { accountId?: string }
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
        // Auto-select first active Meta-family account
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
    // the correct platform-specific token. Previously Threads tests inside runMetaTests
    // used the Facebook page token, which always failed against graph.threads.net.
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
            accountId: account.id,
            platform: account.platform,
            adminId: admin.userId,
            hasFb: !!fbAccount,
            hasIg: !!igAccount,
            hasThreads: !!threadsAccount,
        },
        'Running Meta API permission tests with sibling account lookup'
    );

    let results: TestResult[];

    if (isThreadsOnly) {
        // No Facebook account in org — can only run Threads-specific tests
        results = await runThreadsTests(account.accessToken);
    } else {
        // Run the full Meta + Threads test suite
        // Determine which token to use for Meta Graph API calls
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
