/**
 * AI Insights Generator
 * Produces plain-English takeaways from analytics data via pure pattern detection.
 *
 * Why: Numbers alone don't drive action. Users need "so what?" statements
 * like "Reels get 3× more engagement than Feed posts" to improve strategy.
 * No external AI API calls — all logic is deterministic and runs server-side.
 */

import type {
    EngagementData, ContentTypeStats, AccountGrowthData
} from './analytics-data';

export interface Insight {
    id: string;
    text: string;
    category: 'positive' | 'negative' | 'neutral' | 'tip';
}

/**
 * Generate actionable insights from already-fetched analytics data.
 * Each detector is independent and produces 0-1 insights.
 */
export function generateInsights(params: {
    engagement: EngagementData;
    contentTypeData: ContentTypeStats[];
    accountGrowth: AccountGrowthData;
    heatmapData: Array<{ day: number; hour: number; value: number }>;
    totalPosts: number;
    postsChange: number;
}): Insight[] {
    const insights: Insight[] = [];
    const { engagement, contentTypeData, accountGrowth, heatmapData, totalPosts, postsChange } = params;

    detectContentTypeWinner(contentTypeData, insights);
    detectEngagementTrend(engagement, insights);
    detectPostingFrequency(totalPosts, postsChange, insights);
    detectFollowerMomentum(accountGrowth, insights);
    detectBestTimeSlot(heatmapData, insights);
    detectLowEngagement(engagement, insights);
    detectPlatformStandout(accountGrowth, insights);
    detectSavesSignal(engagement, insights);

    return insights;
}

// ---------------------------------------------------------------------------
// Individual Detectors
// ---------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which content type outperforms others? */
function detectContentTypeWinner(data: ContentTypeStats[], out: Insight[]) {
    if (data.length < 2) return;
    const sorted = [...data].sort((a, b) => b.avgEngagement - a.avgEngagement);
    const best = sorted[0];
    const rest = sorted.slice(1);
    const avgRest = rest.reduce((s, d) => s + d.avgEngagement, 0) / rest.length;
    if (avgRest <= 0) return;
    const ratio = best.avgEngagement / avgRest;
    if (ratio >= 1.5) {
        out.push({
            id: 'content-type-winner',
            text: `${best.postType} posts get ${ratio.toFixed(1)}× more engagement than other content types.`,
            category: 'positive',
        });
    }
}

/** Is overall engagement trending up or down? */
function detectEngagementTrend(eng: EngagementData, out: Insight[]) {
    const totalChange = eng.likesChange + eng.commentsChange + eng.sharesChange;
    const avgChange = totalChange / 3;
    if (avgChange > 20) {
        out.push({
            id: 'engagement-rising',
            text: `Engagement is surging — likes, comments, and shares are up an average of ${Math.round(avgChange)}% vs the previous period.`,
            category: 'positive',
        });
    } else if (avgChange < -20) {
        out.push({
            id: 'engagement-falling',
            text: `Engagement dropped an average of ${Math.abs(Math.round(avgChange))}% across likes, comments, and shares. Consider experimenting with different content formats.`,
            category: 'negative',
        });
    }
}

/** Has posting frequency changed significantly? */
function detectPostingFrequency(total: number, change: number, out: Insight[]) {
    if (change > 30) {
        out.push({
            id: 'posting-up',
            text: `Posting frequency is up ${Math.round(change)}% this period (${total} posts). Great consistency!`,
            category: 'positive',
        });
    } else if (change < -30) {
        out.push({
            id: 'posting-down',
            text: `Posting frequency dropped ${Math.abs(Math.round(change))}% this period (${total} posts). Consistent posting drives algorithmic reach.`,
            category: 'negative',
        });
    }
}

/** Is follower growth accelerating or stalling? */
function detectFollowerMomentum(growth: AccountGrowthData, out: Insight[]) {
    if (growth.totalFollowers <= 0) return;
    const pct = (growth.totalFollowerChange / growth.totalFollowers) * 100;
    if (pct > 2) {
        out.push({
            id: 'follower-momentum',
            text: `Your audience grew by ${pct.toFixed(1)}% this period (+${formatK(growth.totalFollowerChange)} followers). Keep the momentum going.`,
            category: 'positive',
        });
    } else if (pct < -1) {
        out.push({
            id: 'follower-decline',
            text: `Follower count dipped by ${Math.abs(pct).toFixed(1)}% this period. Focus on shareable, save-worthy content to reverse the trend.`,
            category: 'negative',
        });
    }
}

/** Which time slot performs best? */
function detectBestTimeSlot(heatmap: Array<{ day: number; hour: number; value: number }>, out: Insight[]) {
    if (heatmap.length === 0) return;
    const best = heatmap.reduce((a, b) => (b.value > a.value ? b : a), heatmap[0]);
    if (best.value <= 0) return;
    const hour = best.hour % 12 || 12;
    const ampm = best.hour < 12 ? 'AM' : 'PM';
    out.push({
        id: 'best-time',
        text: `${DAYS[best.day]} at ${hour}${ampm} is your highest-engagement posting slot. Schedule your best content here.`,
        category: 'tip',
    });
}

/** Warn if engagement rate is very low */
function detectLowEngagement(eng: EngagementData, out: Insight[]) {
    if (eng.avgEngagementRate > 0 && eng.avgEngagementRate < 1) {
        out.push({
            id: 'low-engagement',
            text: `Average engagement rate is ${eng.avgEngagementRate.toFixed(2)}% — below the 1% benchmark. Try asking questions in captions or using carousel posts to boost interaction.`,
            category: 'negative',
        });
    }
}

/** Highlight standout platform */
function detectPlatformStandout(growth: AccountGrowthData, out: Insight[]) {
    if (growth.accounts.length < 2) return;
    const best = growth.accounts.reduce((a, b) => (b.followerChange > a.followerChange ? b : a));
    if (best.followerChange <= 0) return;
    out.push({
        id: 'platform-standout',
        text: `${capitalize(best.platform)} is your fastest-growing platform with +${formatK(best.followerChange)} new followers this period.`,
        category: 'positive',
    });
}

/** High saves signal algorithm-favored content */
function detectSavesSignal(eng: EngagementData, out: Insight[]) {
    if (eng.totalSaves > 0 && eng.savesChange > 30) {
        out.push({
            id: 'saves-rising',
            text: `Saves are up ${Math.round(eng.savesChange)}% — a strong signal. Platforms reward save-worthy content with more distribution.`,
            category: 'positive',
        });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatK(n: number): string {
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
