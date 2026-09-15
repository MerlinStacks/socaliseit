# YouTube owner analytics

The Analytics dashboard includes a **YouTube insights** section on desktop and mobile when All or YouTube is selected. Unlike lifetime public counters, these reports measure activity during the selected period.

## Available reports

- Daily watch-time trend and aggregate watch minutes, average view duration (seconds), and average percentage viewed.
- Subscribers gained, lost, and net, plus gained subscribers / views × 100. This ratio is not a unique-viewer conversion funnel. Channel subscriptions can include subscriptions outside video watch pages; video-filtered subscription metrics follow YouTube's video attribution rules.
- Traffic-source views and watch minutes.
- Per-video audience retention, plotted against elapsed video time. Rewatches can result in retention above 100%.

Choose a connected account and optionally a video. Video selection filters all reports; retention requires a video. The selector contains up to 50 recent published posts recorded in this application, not the entire YouTube video library. Channel reports cover the whole channel, including older videos.

## Google configuration

Enable **YouTube Data API v3** and **YouTube Analytics API** in the Google Cloud project used for YouTube OAuth. The existing connection configuration requests `https://www.googleapis.com/auth/yt-analytics.readonly`; no monetary analytics scope is needed. Reconnect older accounts if their grants lack analytics access. The authorizing user must own the selected channel.

Missing permissions, empty reports, and temporary report failures are not displayed as zero activity. Report families load independently, so a retention failure does not discard watch-time data. Disabled APIs or quota failures require fixing the Google project or retrying, rather than simply reconnecting.

## Reporting windows and storage

`GET /api/analytics/youtube?range=30d` is authenticated and organization-scoped. Optional parameters are `accountId` and `videoId`. Video ownership is checked against the selected channel before requesting private video reports.

Supported windows are 7, 30, and 90 days, inclusive, ending yesterday in `America/Los_Angeles`. The dashboard's yearly selection explicitly falls back to 90 days for this section. YouTube data can lag: the latest returned daily row is displayed, but does not prove every report is complete through that date.

These are live, no-store reports, not a new historical warehouse. Refreshing or changing a selection requests Google reports again. Existing scheduled account snapshots retain public counters and a correctly dated latest-day private summary when available. No database migration or analytics backfill is required for this feature.

## Verification

From `app/`:

```sh
npx vitest run src/lib/platform-api/__tests__/youtube-analytics.test.ts src/lib/platform-api/__tests__/youtube-api.test.ts src/app/api/analytics/youtube/__tests__/route.test.ts src/components/analytics/__tests__/youtube-insights.test.tsx
```

Tests mock Google responses. Production validation still requires a connected channel with analytics permissions and sufficient report data.
