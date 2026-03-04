---
name: bullmq-worker
description: How to create or modify BullMQ background workers (job processors, queues, scheduled tasks)
---

# BullMQ Worker Development

Use this skill when creating new background workers or modifying existing job processors.

## Architecture

```
src/lib/bullmq/connection.ts  → Shared Redis connection
src/lib/bullmq/queues.ts      → Queue definitions + job data types + scheduler helpers
src/workers/index.ts           → Worker registration + graceful shutdown
src/workers/<name>-worker.ts   → Individual worker processor
```

---

## Creating a New Worker

### 1. Define the Queue

In `src/lib/bullmq/queues.ts`:

```typescript
/**
 * <Name> Queue
 * <Why this job exists>.
 */
export const myJobQueue = new Queue('my-job', {
    ...baseOptions,
    defaultJobOptions: {
        ...baseOptions.defaultJobOptions,
        attempts: 3,     // How many retries
    },
});
```

Add the queue to the `allQueues` array at the bottom of the file.

### 2. Define Job Data Type

In the same file, add:
```typescript
/** Job data for my-job processing */
export interface MyJobData {
    organizationId: string;
    // ... job-specific fields
}
```

### 3. Create Worker File

Create `src/workers/my-job-worker.ts`:

```typescript
/**
 * My Job Worker
 * <What this worker does>
 *
 * Why: <Business reason for this background job>
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { MyJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';

/**
 * Process a single my-job.
 */
async function processMyJob(job: Job<MyJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'my-job');
    const { organizationId } = job.data;

    log.info({ organizationId }, 'Starting my-job');

    try {
        // ... business logic (call service functions, not inline)
        log.info('my-job completed');
    } catch (error) {
        log.error({ err: error }, 'my-job failed');
        throw error; // Re-throw to trigger BullMQ retry
    }
}

/**
 * Create and start the my-job worker.
 */
export function createMyJobWorker(): Worker<MyJobData> {
    const worker = new Worker<MyJobData>('my-job', processMyJob, {
        connection: getBullMQConnection(),
        concurrency: 2,
        limiter: {
            max: 5,
            duration: 60000,
        },
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'my-job');
        log.info('my-job completed successfully');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'my-job');
        log.error({ err }, 'my-job failed');
    });

    return worker;
}
```

### 4. Register in Worker Index

In `src/workers/index.ts`:

1. Add the import:
```typescript
import { createMyJobWorker } from './my-job-worker';
```

2. Inside `initializeWorkers()`, add:
```typescript
const myJobWorker = createMyJobWorker();
workers.push(myJobWorker);
logger.info('My job worker initialized');
```

### 5. Add Scheduler (if recurring)

If the job needs to repeat on a schedule, add a scheduler function in `src/lib/bullmq/queues.ts`:

```typescript
/**
 * Schedule repeating my-job.
 */
export async function scheduleMyJob(): Promise<void> {
    await myJobQueue.upsertJobScheduler(
        'my-job-repeatable',
        { every: 60000 * 15 }, // every 15 minutes
        { data: { organizationId: '', type: 'sweep' } }
    );
}
```

Then call it from `initializeWorkers()` in `workers/index.ts`.

---

## Conventions

| Rule | Detail |
|------|--------|
| Queue name | Kebab-case: `'my-job'` |
| Worker file | `src/workers/<queue-name>-worker.ts` |
| Factory function | `create<Name>Worker()` returning `Worker<T>` |
| Processor function | `process<Name>(job: Job<T>)` – async, throws on failure |
| Logging | Use `createJobLogger(job.id, 'queue-name')` — never `console.log` |
| Error handling | **Always re-throw** after logging so BullMQ retries |
| Business logic | Call service functions, don't inline DB queries in the worker |
| Concurrency | Default `2` unless rate-limited by platform APIs |
| Connection | Always use `getBullMQConnection()` — never create new Redis clients |

---

## Reference Files

| Purpose | Path |
|---------|------|
| Redis connection | `src/lib/bullmq/connection.ts` |
| Queue definitions | `src/lib/bullmq/queues.ts` |
| Worker index | `src/workers/index.ts` |
| Simple worker example | `src/workers/engagement-sync-worker.ts` |
| Complex worker example | `src/workers/post-publisher.ts` |
| Job logger | `src/lib/logger.ts` (`createJobLogger`) |
