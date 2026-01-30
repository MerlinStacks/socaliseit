---
name: webhook-ingestion-patterns
description: Reliable webhook processing with idempotency, signature verification, retry handling for platform callbacks and real-time updates.
---

# Webhook Ingestion Patterns

## Signature Verification

```typescript
// lib/webhooks/verify.ts
import crypto from 'crypto';

export function verifyMetaSignature(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.META_APP_SECRET!)
    .update(body)
    .digest('hex');
  return `sha256=${expected}` === signature;
}

export function verifyTikTokSignature(body: string, timestamp: string, sig: string): boolean {
  const payload = `${timestamp}${body}`;
  const expected = crypto
    .createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET!)
    .update(payload)
    .digest('hex');
  return expected === sig;
}
```

## Webhook Handler Pattern

```typescript
// app/api/webhooks/[platform]/route.ts
export async function POST(req: Request, { params }: { params: { platform: string } }) {
  const body = await req.text();
  const signature = req.headers.get('x-hub-signature-256') || '';

  // 1. Verify signature
  if (!verifySignature(params.platform, body, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);

  // 2. Check idempotency (prevent duplicate processing)
  const eventId = event.id || crypto.randomUUID();
  const processed = await redis.get(`webhook:${eventId}`);
  if (processed) {
    return new Response('Already processed', { status: 200 });
  }

  // 3. Mark as processing (with TTL)
  await redis.set(`webhook:${eventId}`, 'processing', 'EX', 86400);

  // 4. Process asynchronously (respond fast, process later)
  await webhookQueue.add('process', { platform: params.platform, event });

  return new Response('OK', { status: 200 });
}
```

## Idempotency Keys

```typescript
// Store processed webhook IDs in database
model WebhookEvent {
  id          String   @id
  platform    String
  eventType   String
  processedAt DateTime @default(now())
  payload     Json?
  @@index([platform, eventType])
}

async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  return !!existing;
}
```

## Retry Strategy

```typescript
// lib/webhooks/queue.ts
export const webhookQueue = new Queue('webhooks', {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

webhookQueue.process('process', async (job) => {
  const { platform, event } = job.data;
  await processWebhookEvent(platform, event);
});
```

## Dead Letter Queue

```typescript
webhookQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed-webhook', {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
    });
    await notifyOps(`Webhook failed after ${job.attemptsMade} attempts: ${err.message}`);
  }
});
```
