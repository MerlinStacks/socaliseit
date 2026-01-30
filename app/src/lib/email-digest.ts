/**
 * Email Digest Service
 * Daily/weekly digest emails to users
 */

// Email sending handled by external service (Resend, SendGrid, etc.)

export interface DigestConfig {
    id: string;
    workspaceId: string;
    userId: string;
    email: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    sendTime: string; // HH:MM format
    timezone: string;
    sections: DigestSection[];
    isActive: boolean;
    lastSentAt?: Date;
    nextSendAt: Date;
}

export type DigestSection =
    | 'performance_summary'
    | 'scheduled_posts'
    | 'top_posts'
    | 'engagement_alerts'
    | 'competitor_activity'
    | 'ai_suggestions'
    | 'trending_topics'
    | 'revenue_summary'
    | 'team_activity';

export interface DigestData {
    period: { start: Date; end: Date };
    performanceSummary?: {
        reach: number;
        reachChange: number;
        engagement: number;
        engagementChange: number;
        followers: number;
        followersChange: number;
        posts: number;
    };
    scheduledPosts?: Array<{
        caption: string;
        platforms: string[];
        scheduledAt: Date;
    }>;
    topPosts?: Array<{
        caption: string;
        platform: string;
        engagement: number;
        reach: number;
    }>;
    engagementAlerts?: Array<{
        type: 'spike' | 'viral' | 'negative';
        message: string;
        postId: string;
    }>;
    competitorActivity?: Array<{
        competitor: string;
        action: string;
        metric: string;
    }>;
    aiSuggestions?: string[];
    trendingTopics?: Array<{
        topic: string;
        platform: string;
        growth: number;
    }>;
    revenueSummary?: {
        total: number;
        change: number;
        topPost: string;
    };
}

/**
 * Configure digest for user
 */
export async function configureDigest(
    workspaceId: string,
    userId: string,
    email: string,
    config: Partial<DigestConfig>
): Promise<DigestConfig> {
    const now = new Date();
    const sendTime = config.sendTime || '09:00';

    // Calculate next send time
    let nextSendAt = new Date();
    const [hours, minutes] = sendTime.split(':').map(Number);
    nextSendAt.setHours(hours, minutes, 0, 0);

    if (nextSendAt <= now) {
        // Schedule for next occurrence
        switch (config.frequency) {
            case 'daily':
                nextSendAt.setDate(nextSendAt.getDate() + 1);
                break;
            case 'weekly':
                nextSendAt.setDate(nextSendAt.getDate() + (7 - nextSendAt.getDay() + 1)); // Monday
                break;
            case 'monthly':
                nextSendAt.setMonth(nextSendAt.getMonth() + 1);
                nextSendAt.setDate(1);
                break;
        }
    }

    const digest: DigestConfig = {
        id: `digest_${Date.now()}`,
        workspaceId,
        userId,
        email,
        frequency: config.frequency || 'daily',
        sendTime,
        timezone: config.timezone || 'America/New_York',
        sections: config.sections || [
            'performance_summary',
            'scheduled_posts',
            'top_posts',
            'ai_suggestions',
        ],
        isActive: config.isActive ?? true,
        nextSendAt,
    };

    // In production, save to database
    return digest;
}

/**
 * Generate digest data
 */
export async function generateDigestData(
    workspaceId: string,
    frequency: 'daily' | 'weekly' | 'monthly',
    sections: DigestSection[]
): Promise<DigestData> {
    const now = new Date();
    let start = new Date();

    switch (frequency) {
        case 'daily':
            start.setDate(start.getDate() - 1);
            break;
        case 'weekly':
            start.setDate(start.getDate() - 7);
            break;
        case 'monthly':
            start.setMonth(start.getMonth() - 1);
            break;
    }

    const data: DigestData = {
        period: { start, end: now },
    };

    // Populate requested sections (mock data)
    if (sections.includes('performance_summary')) {
        data.performanceSummary = {
            reach: 45000,
            reachChange: 12,
            engagement: 4.5,
            engagementChange: -2,
            followers: 12500,
            followersChange: 3,
            posts: 8,
        };
    }

    if (sections.includes('scheduled_posts')) {
        data.scheduledPosts = [
            { caption: 'New product launch! 🚀', platforms: ['instagram', 'tiktok'], scheduledAt: new Date(Date.now() + 3600 * 1000) },
            { caption: 'Behind the scenes...', platforms: ['instagram'], scheduledAt: new Date(Date.now() + 86400 * 1000) },
        ];
    }

    if (sections.includes('top_posts')) {
        data.topPosts = [
            { caption: 'Our bestselling product...', platform: 'instagram', engagement: 8.2, reach: 15000 },
            { caption: 'Quick tutorial: How to...', platform: 'tiktok', engagement: 12.5, reach: 45000 },
        ];
    }

    if (sections.includes('engagement_alerts')) {
        data.engagementAlerts = [
            { type: 'viral', message: 'Your TikTok post is getting 10x normal views!', postId: 'post_123' },
        ];
    }

    if (sections.includes('ai_suggestions')) {
        data.aiSuggestions = [
            'Post more video content - your videos get 2x engagement',
            'Try posting at 7 PM instead of 12 PM for better reach',
            'Consider using #trending hashtag (up 45% this week)',
        ];
    }

    if (sections.includes('trending_topics')) {
        data.trendingTopics = [
            { topic: '#GRWM', platform: 'tiktok', growth: 45 },
            { topic: 'Day in my life', platform: 'instagram', growth: 28 },
        ];
    }

    if (sections.includes('revenue_summary')) {
        data.revenueSummary = {
            total: 4520,
            change: 15,
            topPost: 'Summer collection launch post',
        };
    }

    return data;
}

/**
 * Render digest email HTML
 */
export function renderDigestEmail(
    workspaceName: string,
    data: DigestData,
    frequency: string
): string {
    const periodLabel = frequency === 'daily' ? 'Yesterday' :
        frequency === 'weekly' ? 'This Week' : 'This Month';

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #D4A574, #E8B4B8); padding: 30px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .header p { color: rgba(255,255,255,0.9); margin: 5px 0 0; }
    .content { padding: 30px; }
    .section { margin-bottom: 30px; }
    .section h2 { font-size: 18px; margin-bottom: 15px; color: #333; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
    .stat { background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
    .stat-change { font-size: 12px; margin-top: 5px; }
    .positive { color: #10B981; }
    .negative { color: #EF4444; }
    .post-list { list-style: none; padding: 0; margin: 0; }
    .post-item { padding: 12px; border-bottom: 1px solid #eee; }
    .post-item:last-child { border-bottom: none; }
    .suggestion { background: #FEF3C7; padding: 12px; border-radius: 8px; margin-bottom: 10px; }
    .footer { padding: 20px 30px; background: #f9f9f9; text-align: center; font-size: 12px; color: #666; }
    .button { display: inline-block; background: #D4A574; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${workspaceName}</h1>
      <p>${periodLabel}'s Performance Digest</p>
    </div>
    <div class="content">
`;

    // Performance Summary
    if (data.performanceSummary) {
        const p = data.performanceSummary;
        html += `
      <div class="section">
        <h2>📊 Performance Summary</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value">${(p.reach / 1000).toFixed(1)}K</div>
            <div class="stat-label">Reach</div>
            <div class="stat-change ${p.reachChange >= 0 ? 'positive' : 'negative'}">${p.reachChange >= 0 ? '↑' : '↓'} ${Math.abs(p.reachChange)}%</div>
          </div>
          <div class="stat">
            <div class="stat-value">${p.engagement}%</div>
            <div class="stat-label">Engagement</div>
            <div class="stat-change ${p.engagementChange >= 0 ? 'positive' : 'negative'}">${p.engagementChange >= 0 ? '↑' : '↓'} ${Math.abs(p.engagementChange)}%</div>
          </div>
          <div class="stat">
            <div class="stat-value">+${p.followersChange}%</div>
            <div class="stat-label">Followers</div>
            <div class="stat-change positive">${p.followers.toLocaleString()} total</div>
          </div>
        </div>
      </div>
    `;
    }

    // AI Suggestions
    if (data.aiSuggestions && data.aiSuggestions.length > 0) {
        html += `
      <div class="section">
        <h2>💡 AI Suggestions</h2>
        ${data.aiSuggestions.map(s => `<div class="suggestion">✨ ${s}</div>`).join('')}
      </div>
    `;
    }

    // Scheduled Posts
    if (data.scheduledPosts && data.scheduledPosts.length > 0) {
        html += `
      <div class="section">
        <h2>📅 Coming Up</h2>
        <ul class="post-list">
          ${data.scheduledPosts.map(p => `
            <li class="post-item">
              <strong>${p.caption.slice(0, 50)}...</strong><br>
              <small>${p.platforms.join(', ')} • ${p.scheduledAt.toLocaleString()}</small>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    }

    // CTA
    html += `
      <div style="text-align: center; margin-top: 30px;">
        <a href="https://app.socialiseit.com/dashboard" class="button">View Full Dashboard →</a>
      </div>
    </div>
    <div class="footer">
      <p>You're receiving this because you enabled ${frequency} digests.</p>
      <p><a href="https://app.socialiseit.com/settings?tab=notifications">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>
  `;

    return html;
}

/**
 * Send digest email
 */
export async function sendDigestEmail(
    to: string,
    subject: string,
    html: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // In production, use Resend or similar
    console.log(`Sending email to ${to}: ${subject}`);

    // Mock success
    return {
        success: true,
        messageId: `msg_${Date.now()}`,
    };
}

/**
 * Process due digests (called by cron job)
 */
export async function processDueDigests(): Promise<{
    processed: number;
    failed: number;
}> {
    // In production:
    // 1. Query all digests where nextSendAt <= now
    // 2. Generate data for each
    // 3. Render and send email
    // 4. Update nextSendAt

    return { processed: 0, failed: 0 };
}
