---
name: redis-caching-patterns
description: Master Redis for caching, session management, pub/sub messaging, and job queues. Use when implementing caching layers, real-time features, or background job processing with BullMQ.
---

# Redis Caching Patterns

Expert guide for Redis integration in Node.js/TypeScript applications. Covers caching strategies, session management, pub/sub, and job queues.

## When to Use This Skill

- Implementing application-level caching
- Managing user sessions with Redis
- Building real-time features with pub/sub
- Setting up background job queues (BullMQ)
- Optimizing database query performance
- Implementing rate limiting

## Connection Setup

```typescript
// lib/redis/client.ts
import { Redis } from 'ioredis';

/**
 * Singleton Redis client with connection pooling.
 * Why: Prevents connection exhaustion and ensures consistent configuration.
 */
class RedisClient {
  private static instance: Redis | null = null;

  static getInstance(): Redis {
    if (!this.instance) {
      this.instance = new Redis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB ?? '0'),
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        // Connection pool settings
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      this.instance.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
      });

      this.instance.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });
    }

    return this.instance;
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
    }
  }
}

export const redis = RedisClient.getInstance();
```

---

## Caching Patterns

### 1. Cache-Aside (Lazy Loading)

Most common pattern. Application manages cache explicitly.

```typescript
// lib/redis/cache.ts
import { redis } from './client';

interface CacheOptions {
  ttl?: number; // seconds
  prefix?: string;
}

/**
 * Generic cache-aside wrapper.
 * Why: Reduces database load by serving cached data when available.
 */
export async function cacheAside<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 3600, prefix = 'cache' } = options;
  const cacheKey = `${prefix}:${key}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  // Fetch from source
  const data = await fetcher();

  // Store in cache (don't await - fire and forget)
  redis.setex(cacheKey, ttl, JSON.stringify(data)).catch((err) => {
    console.error('[Cache] Write failed:', err.message);
  });

  return data;
}

// Usage
const user = await cacheAside(
  `user:${userId}`,
  () => prisma.user.findUnique({ where: { id: userId } }),
  { ttl: 300 } // 5 minutes
);
```

### 2. Write-Through

Writes to cache and database simultaneously.

```typescript
/**
 * Write-through pattern for consistent cache updates.
 * Why: Ensures cache is always in sync with database.
 */
export async function writeThrough<T>(
  key: string,
  data: T,
  writer: (data: T) => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 3600, prefix = 'cache' } = options;
  const cacheKey = `${prefix}:${key}`;

  // Write to database
  const result = await writer(data);

  // Update cache
  await redis.setex(cacheKey, ttl, JSON.stringify(result));

  return result;
}

// Usage
const updatedUser = await writeThrough(
  `user:${userId}`,
  { name: 'New Name' },
  (data) => prisma.user.update({ where: { id: userId }, data }),
  { ttl: 300 }
);
```

### 3. Cache Invalidation

```typescript
/**
 * Pattern-based cache invalidation.
 * Why: Allows bulk invalidation of related cache entries.
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return 0;

  const pipeline = redis.pipeline();
  keys.forEach((key) => pipeline.del(key));
  await pipeline.exec();

  return keys.length;
}

// Usage: Invalidate all user-related cache
await invalidatePattern('cache:user:*');

// Invalidate specific entity
await redis.del(`cache:user:${userId}`);
```

---

## Session Management

```typescript
// lib/redis/session.ts
import { redis } from './client';
import { nanoid } from 'nanoid';

interface Session {
  userId: string;
  createdAt: number;
  data: Record<string, unknown>;
}

const SESSION_TTL = 24 * 60 * 60; // 24 hours
const SESSION_PREFIX = 'session';

/**
 * Create a new session.
 */
export async function createSession(userId: string, data: Record<string, unknown> = {}): Promise<string> {
  const sessionId = nanoid(32);
  const session: Session = {
    userId,
    createdAt: Date.now(),
    data,
  };

  await redis.setex(
    `${SESSION_PREFIX}:${sessionId}`,
    SESSION_TTL,
    JSON.stringify(session)
  );

  // Track user's sessions for multi-device logout
  await redis.sadd(`${SESSION_PREFIX}:user:${userId}`, sessionId);

  return sessionId;
}

/**
 * Get session with automatic TTL refresh.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const key = `${SESSION_PREFIX}:${sessionId}`;
  const data = await redis.get(key);

  if (!data) return null;

  // Refresh TTL on access (sliding expiration)
  await redis.expire(key, SESSION_TTL);

  return JSON.parse(data) as Session;
}

/**
 * Destroy session.
 */
export async function destroySession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  await redis.del(`${SESSION_PREFIX}:${sessionId}`);
  await redis.srem(`${SESSION_PREFIX}:user:${session.userId}`, sessionId);
}

/**
 * Logout from all devices.
 */
export async function destroyAllUserSessions(userId: string): Promise<number> {
  const sessionIds = await redis.smembers(`${SESSION_PREFIX}:user:${userId}`);
  
  if (sessionIds.length === 0) return 0;

  const pipeline = redis.pipeline();
  sessionIds.forEach((id) => pipeline.del(`${SESSION_PREFIX}:${id}`));
  pipeline.del(`${SESSION_PREFIX}:user:${userId}`);
  await pipeline.exec();

  return sessionIds.length;
}
```

---

## Pub/Sub for Real-Time

```typescript
// lib/redis/pubsub.ts
import { Redis } from 'ioredis';

/**
 * Pub/Sub requires separate connections.
 * Why: Subscriber connection is blocked waiting for messages.
 */
const publisher = new Redis(process.env.REDIS_URL!);
const subscriber = new Redis(process.env.REDIS_URL!);

type MessageHandler = (channel: string, message: string) => void;
const handlers = new Map<string, Set<MessageHandler>>();

// Initialize subscriber
subscriber.on('message', (channel, message) => {
  const channelHandlers = handlers.get(channel);
  if (channelHandlers) {
    channelHandlers.forEach((handler) => handler(channel, message));
  }
});

/**
 * Publish a message to a channel.
 */
export async function publish<T>(channel: string, data: T): Promise<void> {
  await publisher.publish(channel, JSON.stringify(data));
}

/**
 * Subscribe to a channel.
 */
export async function subscribe(channel: string, handler: MessageHandler): Promise<() => void> {
  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
    await subscriber.subscribe(channel);
  }

  handlers.get(channel)!.add(handler);

  // Return unsubscribe function
  return async () => {
    const channelHandlers = handlers.get(channel);
    if (channelHandlers) {
      channelHandlers.delete(handler);
      if (channelHandlers.size === 0) {
        handlers.delete(channel);
        await subscriber.unsubscribe(channel);
      }
    }
  };
}

// Usage
const unsubscribe = await subscribe('posts:new', (channel, message) => {
  const post = JSON.parse(message);
  console.log('New post:', post.title);
});

await publish('posts:new', { id: '123', title: 'Hello World' });
```

---

## Job Queues with BullMQ

```typescript
// lib/queue/post-queue.ts
import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis/client';

interface PublishJobData {
  postId: string;
  platforms: string[];
  scheduledFor: Date;
}

/**
 * Queue for scheduled post publishing.
 */
export const postQueue = new Queue<PublishJobData>('post-publishing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Add a job to publish a post.
 */
export async function schedulePost(data: PublishJobData): Promise<string> {
  const delay = new Date(data.scheduledFor).getTime() - Date.now();
  
  const job = await postQueue.add('publish', data, {
    delay: Math.max(0, delay),
    jobId: `post:${data.postId}`, // Dedupe by postId
  });

  return job.id!;
}

/**
 * Worker to process publishing jobs.
 */
export const postWorker = new Worker<PublishJobData>(
  'post-publishing',
  async (job: Job<PublishJobData>) => {
    const { postId, platforms } = job.data;
    
    console.log(`Publishing post ${postId} to ${platforms.join(', ')}`);
    
    // Publish to each platform
    for (const platform of platforms) {
      await publishToPlatform(postId, platform);
      
      // Update progress
      await job.updateProgress((platforms.indexOf(platform) + 1) / platforms.length * 100);
    }

    return { published: true, platforms };
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000, // 10 jobs per second
    },
  }
);

// Event handlers
postWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

postWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
```

---

## Rate Limiting

```typescript
// lib/redis/rate-limit.ts
import { redis } from './client';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding window rate limiter.
 * Why: More accurate than fixed windows, prevents burst at window boundaries.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `ratelimit:${key}`;

  // Use sorted set with timestamp as score
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart); // Remove old entries
  pipeline.zadd(redisKey, now, `${now}`); // Add current request
  pipeline.zcard(redisKey); // Count requests in window
  pipeline.expire(redisKey, windowSeconds); // Set expiry

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number;

  const allowed = count <= limit;
  
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowSeconds * 1000,
  };
}

// API route usage
export async function rateLimitMiddleware(
  req: Request,
  identifier: string
): Promise<Response | null> {
  const result = await checkRateLimit(identifier, 100, 60); // 100 req/min

  if (!result.allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt.toString(),
        'Retry-After': '60',
      },
    });
  }

  return null; // Proceed with request
}
```

---

## Best Practices

1. **Use connection pooling** - Never create new connections per request
2. **Set TTLs on everything** - Prevent memory leaks from orphaned keys
3. **Use pipelines for bulk operations** - Reduces round trips
4. **Namespace your keys** - Use prefixes like `cache:`, `session:`, `queue:`
5. **Handle connection errors gracefully** - App should work without Redis (degraded mode)
6. **Monitor memory usage** - Set `maxmemory` and eviction policies
7. **Use Lua scripts for atomic operations** - When you need transactional behavior

## Common Pitfalls

- **Blocking operations in Node.js** - Use `SCAN` instead of `KEYS` in production
- **Large values** - Keep values under 100KB; use compression for larger data
- **Missing expiration** - Always set TTL to prevent unbounded growth
- **Connection leaks** - Ensure proper cleanup on process exit
