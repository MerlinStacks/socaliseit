/**
 * Analytics Advisor Prompt Builder
 * Constructs a structured prompt for OpenRouter to generate
 * Vista-Social-style narrative analytics summaries.
 *
 * Why: Raw metrics are hard to interpret. An LLM can synthesize
 * engagement trends, follower growth, and content performance into
 * actionable prose with bold stat callouts and platform-specific bullets.
 */

export interface AdvisorMetrics {
    /** Engagement totals + % changes vs previous period */
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    totalReach: number;
    totalImpressions: number;
    likesChange: number;
    commentsChange: number;
    sharesChange: number;
    reachChange: number;
    impressionsChange: number;
    savesChange: number;
    avgEngagementRate: number;

    /** Follower / account growth */
    totalFollowers: number;
    totalFollowerChange: number;
    accounts: Array<{
        platform: string;
        name: string;
        currentFollowers: number;
        followerChange: number;
    }>;

    /** Content breakdown */
    contentTypes: Array<{
        postType: string;
        count: number;
        avgEngagement: number;
    }>;

    /** Overall posting stats */
    totalPosts: number;
    postsChange: number;

    /** Date range label for context */
    rangeLabel: string;
}

export interface AdvisorResponse {
    headline: string;
    summary: string;
    bullets: string[];
    recommendations: string[];
}

const SYSTEM_PROMPT = `You are a senior social media strategist analyzing performance data for a client.
Your job is to produce a concise, insightful executive summary. Be specific with numbers — bold the most important stats using **markdown** syntax.

Respond ONLY with valid JSON matching this exact schema (no markdown fences, no commentary):
{
  "headline": "One-line summary of the period (max 80 chars, neutral tone, no emoji)",
  "summary": "2-3 sentence narrative with bold stats explaining the overall picture",
  "bullets": ["3-5 platform-specific or metric-specific observations, each one sentence"],
  "recommendations": ["2-4 actionable next steps based on the data"]
}

Rules:
- Use actual numbers from the data, never fabricate stats.
- Bold important numbers in summary and bullets using **number** syntax.
- Keep the headline under 80 characters.
- Write in third person ("the account", "content", "engagement").
- Be direct and analytical, not fluffy.`;

/**
 * Build the user prompt containing all analytics context.
 * Why: Separating the user prompt from the system prompt lets us
 * cache the system prompt and vary only the data per request.
 */
export function buildAdvisorPrompt(metrics: AdvisorMetrics): string {
    const lines: string[] = [
        `Period: ${metrics.rangeLabel}`,
        '',
        '## Engagement Metrics',
        `Likes: ${metrics.totalLikes.toLocaleString()} (${fmtChange(metrics.likesChange)})`,
        `Comments: ${metrics.totalComments.toLocaleString()} (${fmtChange(metrics.commentsChange)})`,
        `Shares: ${metrics.totalShares.toLocaleString()} (${fmtChange(metrics.sharesChange)})`,
        `Saves: ${metrics.totalSaves.toLocaleString()} (${fmtChange(metrics.savesChange)})`,
        `Reach: ${metrics.totalReach.toLocaleString()} (${fmtChange(metrics.reachChange)})`,
        `Impressions: ${metrics.totalImpressions.toLocaleString()} (${fmtChange(metrics.impressionsChange)})`,
        `Avg Engagement Rate: ${metrics.avgEngagementRate.toFixed(2)}%`,
        '',
        '## Follower Growth',
        `Total Followers: ${metrics.totalFollowers.toLocaleString()} (${fmtChange(
            metrics.totalFollowerChange > 0 && metrics.totalFollowers > 0
                ? (metrics.totalFollowerChange / metrics.totalFollowers) * 100
                : 0
        )})`,
    ];

    if (metrics.accounts.length > 0) {
        lines.push('', 'Per-platform breakdown:');
        for (const acct of metrics.accounts) {
            lines.push(
                `- ${capitalize(acct.platform)} (${acct.name}): ${acct.currentFollowers.toLocaleString()} followers (${acct.followerChange >= 0 ? '+' : ''}${acct.followerChange.toLocaleString()})`
            );
        }
    }

    lines.push('', '## Content Performance');
    lines.push(`Total Posts: ${metrics.totalPosts} (${fmtChange(metrics.postsChange)})`);

    if (metrics.contentTypes.length > 0) {
        lines.push('', 'By content type:');
        for (const ct of metrics.contentTypes) {
            lines.push(`- ${ct.postType}: ${ct.count} posts, avg engagement ${ct.avgEngagement.toFixed(2)}%`);
        }
    }

    return lines.join('\n');
}

/**
 * Returns the system prompt for the advisor.
 */
export function getAdvisorSystemPrompt(): string {
    return SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtChange(pct: number): string {
    if (pct === 0) return 'no change';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${Math.round(pct)}%`;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
