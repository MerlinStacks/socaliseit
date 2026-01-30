---
name: database-query-optimization
description: Indexing strategies, query analysis, N+1 detection, and Prisma-specific performance tuning.
---

# Database Query Optimization

## Index Strategy

```prisma
// schema.prisma
model Post {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  publishedAt DateTime?
  authorId    String
  workspaceId String
  status      PostStatus

  // Composite index for common query patterns
  @@index([workspaceId, createdAt(sort: Desc)])
  @@index([authorId, status])
  @@index([workspaceId, status, publishedAt])
}
```

## Query Analysis

```typescript
// Enable Prisma query logging
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) {
    console.warn(`Slow query (${e.duration}ms):`, e.query);
  }
});
```

## N+1 Prevention

```typescript
// BAD: N+1 query
const posts = await prisma.post.findMany();
for (const post of posts) {
  const author = await prisma.user.findUnique({ where: { id: post.authorId } });
}

// GOOD: Eager loading with include
const posts = await prisma.post.findMany({
  include: { author: true },
});

// GOOD: Select only needed fields
const posts = await prisma.post.findMany({
  select: {
    id: true,
    title: true,
    author: { select: { name: true, avatar: true } },
  },
});
```

## Pagination

```typescript
// Cursor-based pagination (performant for large datasets)
async function getPosts(cursor?: string, limit = 20) {
  return prisma.post.findMany({
    take: limit + 1, // Fetch one extra to check hasMore
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: { createdAt: 'desc' },
  });
}

// Offset pagination (simpler, but slower for large offsets)
async function getPostsOffset(page: number, limit = 20) {
  const [posts, total] = await Promise.all([
    prisma.post.findMany({ skip: (page - 1) * limit, take: limit }),
    prisma.post.count(),
  ]);
  return { posts, total, pages: Math.ceil(total / limit) };
}
```

## Batch Operations

```typescript
// Use transactions for multiple writes
await prisma.$transaction([
  prisma.post.updateMany({ where: { authorId }, data: { status: 'ARCHIVED' } }),
  prisma.user.update({ where: { id: authorId }, data: { postsArchived: true } }),
]);

// createMany for bulk inserts
await prisma.post.createMany({
  data: posts,
  skipDuplicates: true,
});
```

## Raw Queries for Complex Operations

```typescript
// When Prisma can't express the query
const results = await prisma.$queryRaw`
  SELECT p.*, COUNT(c.id) as comment_count
  FROM "Post" p
  LEFT JOIN "Comment" c ON c."postId" = p.id
  WHERE p."workspaceId" = ${workspaceId}
  GROUP BY p.id
  ORDER BY comment_count DESC
  LIMIT 10
`;
```

## Connection Pooling

```typescript
// For serverless (Vercel, AWS Lambda)
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL + '?connection_limit=1' },
  },
});

// Use Prisma Accelerate or PgBouncer for production
```
