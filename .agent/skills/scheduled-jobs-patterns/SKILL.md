---
name: scheduled-jobs-patterns
description: Cron-based scheduling, job queues (BullMQ), retry logic for post scheduling features.
---

# Scheduled Jobs Patterns

## BullMQ Setup

```typescript
// lib/queue/index.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const postQueue = new Queue('posts', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const queueEvents = new QueueEvents('posts', { connection });
```

## Scheduled Post Worker

```typescript
// lib/queue/workers/post-worker.ts
import { Worker, Job } from 'bullmq';

interface PublishJobData {
  postId: string;
  accountId: string;
  scheduledAt: Date;
}

const worker = new Worker<PublishJobData>(
  'posts',
  async (job: Job<PublishJobData>) => {
    const { postId, accountId } = job.data;
    
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.status === 'PUBLISHED') return;
    
    const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
    const client = getPlatformClient(account.platform);
    
    const result = await client.publishPost({
      content: post.content,
      media: post.media,
      accessToken: await getValidToken(accountId),
    });
    
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        platformPostId: result.id,
      },
    });
    
    return { success: true, platformPostId: result.id };
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 }, // Rate limit
  }
);

worker.on('completed', (job, result) => {
  console.log(`Post ${job.data.postId} published:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`Post ${job?.data.postId} failed:`, err.message);
});
```

## Scheduling Posts

```typescript
// app/api/posts/schedule/route.ts
export async function POST(req: Request) {
  const { postId, scheduledAt, accountIds } = await req.json();
  
  const scheduledDate = new Date(scheduledAt);
  const delay = scheduledDate.getTime() - Date.now();
  
  if (delay < 0) {
    return Response.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
  }
  
  // Create job for each account
  const jobs = accountIds.map((accountId: string) =>
    postQueue.add(
      'publish',
      { postId, accountId, scheduledAt: scheduledDate },
      {
        delay,
        jobId: `${postId}-${accountId}`, // Prevent duplicates
      }
    )
  );
  
  await Promise.all(jobs);
  
  await prisma.post.update({
    where: { id: postId },
    data: { status: 'SCHEDULED', scheduledAt: scheduledDate },
  });
  
  return Response.json({ success: true });
}
```

## Cron Jobs

```typescript
// lib/cron/index.ts
import cron from 'node-cron';

// Run every hour - cleanup old jobs
cron.schedule('0 * * * *', async () => {
  const oldJobs = await postQueue.getJobs(['completed', 'failed']);
  const week = 7 * 24 * 60 * 60 * 1000;
  
  for (const job of oldJobs) {
    if (job.timestamp < Date.now() - week) {
      await job.remove();
    }
  }
});

// Run daily at midnight - analytics aggregation
cron.schedule('0 0 * * *', async () => {
  await aggregateDailyAnalytics();
});

// Run every 15 minutes - token refresh check
cron.schedule('*/15 * * * *', async () => {
  const expiringSoon = await prisma.socialAccount.findMany({
    where: {
      tokenExpiresAt: { lt: new Date(Date.now() + 30 * 60 * 1000) },
    },
  });
  
  for (const account of expiringSoon) {
    await refreshAccountToken(account.id);
  }
});
```

## Job Dashboard (Bull Board)

```typescript
// app/api/admin/queues/route.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(postQueue)],
  serverAdapter,
});

export { serverAdapter };
```

## Cancel Scheduled Job

```typescript
export async function DELETE(req: Request) {
  const { postId, accountId } = await req.json();
  
  const jobId = `${postId}-${accountId}`;
  const job = await postQueue.getJob(jobId);
  
  if (job) {
    await job.remove();
  }
  
  return Response.json({ success: true });
}
```
