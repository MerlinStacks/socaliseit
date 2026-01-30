---
name: performance-profiling
description: Lighthouse, bundle analysis, React profiler, and Core Web Vitals optimization. Use when optimizing app performance or diagnosing slow pages.
---

# Performance Profiling

## Bundle Analysis

```bash
# Install analyzer
npm install @next/bundle-analyzer

# next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer';
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
export default withBundleAnalyzer(nextConfig);

# Run analysis
ANALYZE=true npm run build
```

## Code Splitting

```typescript
// Dynamic imports for heavy components
const VideoEditor = dynamic(() => import('@/components/video-editor'), {
  loading: () => <Skeleton className="h-[500px]" />,
  ssr: false,
});

// Route-based splitting (automatic in Next.js App Router)
// Heavy libraries
const Chart = dynamic(() => import('recharts').then(mod => mod.LineChart));
```

## React Profiler

```typescript
import { Profiler } from 'react';

function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  console.log(`${id} ${phase}: ${actualDuration.toFixed(2)}ms`);
}

<Profiler id="PostList" onRender={onRender}>
  <PostList posts={posts} />
</Profiler>
```

## Core Web Vitals

```typescript
// app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
```

## Image Optimization

```typescript
import Image from 'next/image';

// Always use Next.js Image for automatic optimization
<Image
  src={post.thumbnail}
  alt={post.title}
  width={400}
  height={300}
  placeholder="blur"
  blurDataURL={post.blurHash}
  priority={isAboveFold}
/>
```

## Memoization

```typescript
// useMemo for expensive computations
const sortedPosts = useMemo(() => 
  [...posts].sort((a, b) => new Date(b.date) - new Date(a.date)),
  [posts]
);

// useCallback for stable function references
const handleClick = useCallback((id: string) => {
  selectPost(id);
}, [selectPost]);

// React.memo for component memoization
const PostCard = memo(function PostCard({ post }) {
  return <div>{post.title}</div>;
});
```

## Lighthouse CI

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse
on: [push]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm run build
      - uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            http://localhost:3000/
            http://localhost:3000/compose
          budgetPath: ./lighthouse-budget.json
```
