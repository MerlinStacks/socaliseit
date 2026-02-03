---
name: social-analytics-insights
description: Master social media analytics including engagement metrics, reach analysis, and performance reporting. Use when building analytics dashboards or generating social media reports.
---

# Social Analytics & Insights

Expert guide for building social media analytics and reporting systems.

## When to Use This Skill

- Building analytics dashboards
- Tracking engagement metrics
- Generating performance reports
- Analyzing audience insights
- Benchmarking content performance

## Core Metrics

```typescript
// types/analytics.ts
interface PostMetrics {
  postId: string;
  platform: Platform;
  impressions: number;
  reach: number;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
  };
  engagementRate: number;
  fetchedAt: Date;
}

interface AccountMetrics {
  followers: number;
  following: number;
  postsCount: number;
  followerGrowth: number; // delta from previous period
  avgEngagementRate: number;
  topPosts: PostMetrics[];
}

// Calculate engagement rate
function calculateEngagementRate(metrics: PostMetrics): number {
  const totalEngagement = 
    metrics.engagement.likes +
    metrics.engagement.comments +
    metrics.engagement.shares +
    metrics.engagement.saves;
  
  return metrics.reach > 0 ? (totalEngagement / metrics.reach) * 100 : 0;
}
```

## Dashboard Components

```tsx
// components/analytics/engagement-chart.tsx
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  date: string;
  engagement: number;
  reach: number;
}

export function EngagementChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        <Line yAxisId="left" type="monotone" dataKey="engagement" stroke="#8b5cf6" />
        <Line yAxisId="right" type="monotone" dataKey="reach" stroke="#06b6d4" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

```tsx
// components/analytics/metric-card.tsx
interface MetricCardProps {
  title: string;
  value: number | string;
  change?: number;
  format?: 'number' | 'percent' | 'compact';
}

export function MetricCard({ title, value, change, format = 'number' }: MetricCardProps) {
  const formattedValue = formatMetric(value, format);
  
  return (
    <div className="metric-card">
      <div className="title">{title}</div>
      <div className="value">{formattedValue}</div>
      {change !== undefined && (
        <div className={`change ${change >= 0 ? 'positive' : 'negative'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function formatMetric(value: number | string, format: string): string {
  if (typeof value === 'string') return value;
  
  switch (format) {
    case 'percent': return `${value.toFixed(1)}%`;
    case 'compact': return Intl.NumberFormat('en', { notation: 'compact' }).format(value);
    default: return value.toLocaleString();
  }
}
```

## Data Aggregation

```typescript
// lib/analytics/aggregation.ts
interface TimeRange {
  start: Date;
  end: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export async function aggregateMetrics(
  accountId: string,
  range: TimeRange
): Promise<DataPoint[]> {
  const metrics = await fetchMetricsInRange(accountId, range.start, range.end);
  
  const grouped = groupByGranularity(metrics, range.granularity);
  
  return Object.entries(grouped).map(([date, posts]) => ({
    date,
    engagement: posts.reduce((sum, p) => sum + p.engagementRate, 0) / posts.length,
    reach: posts.reduce((sum, p) => sum + p.reach, 0),
    impressions: posts.reduce((sum, p) => sum + p.impressions, 0),
  }));
}

function groupByGranularity(
  metrics: PostMetrics[],
  granularity: string
): Record<string, PostMetrics[]> {
  const formatStr = {
    hour: 'yyyy-MM-dd HH:00',
    day: 'yyyy-MM-dd',
    week: 'yyyy-ww',
    month: 'yyyy-MM',
  }[granularity];
  
  return metrics.reduce((acc, m) => {
    const key = format(m.fetchedAt, formatStr);
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, PostMetrics[]>);
}
```

## Report Generation

```typescript
// lib/analytics/report.ts
interface Report {
  title: string;
  period: { start: Date; end: Date };
  summary: {
    totalPosts: number;
    totalReach: number;
    avgEngagement: number;
    followerChange: number;
  };
  topContent: PostMetrics[];
  platformBreakdown: Record<Platform, AccountMetrics>;
}

export async function generateReport(
  accountId: string,
  start: Date,
  end: Date
): Promise<Report> {
  const [posts, metrics, followers] = await Promise.all([
    fetchPostsInRange(accountId, start, end),
    fetchMetricsInRange(accountId, start, end),
    fetchFollowerHistory(accountId, start, end),
  ]);

  const topContent = metrics
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10);

  return {
    title: `Performance Report`,
    period: { start, end },
    summary: {
      totalPosts: posts.length,
      totalReach: metrics.reduce((sum, m) => sum + m.reach, 0),
      avgEngagement: metrics.reduce((sum, m) => sum + m.engagementRate, 0) / metrics.length,
      followerChange: followers.at(-1)?.count - followers[0]?.count,
    },
    topContent,
    platformBreakdown: groupByPlatform(metrics),
  };
}

// Export to PDF
export async function exportReportToPDF(report: Report): Promise<Buffer> {
  const doc = new jsPDF();
  // ... render report to PDF
  return doc.output('arraybuffer');
}
```

## Best Practices

1. **Cache metrics** - Platform APIs have rate limits
2. **Use webhooks** - Subscribe to real-time updates when available
3. **Store historical data** - Platforms limit historical access
4. **Calculate incrementally** - Update aggregates on new data
5. **Show comparisons** - Previous period changes add context
6. **Export capabilities** - PDF, CSV, scheduled email reports
