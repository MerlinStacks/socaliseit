---
name: prisma-schema-manager
description: Expert guide for managing database schemas with Prisma 5+. Covers robust schema design, migration workflows, type-safe client generation, and efficient query patterns.
---

# Prisma Schema Manager Skill

This skill guides you through the lifecycle of database management using Prisma. Use it when designing new data models, modifying existing schemas, or debugging database interactions.

## Core Workflows

### 1. Schema Definition (`schema.prisma`)
- **Naming**: Use `CamelCase` for models, `camelCase` for fields.
- **IDs**: Prefer Cuid2 or UUID for primary keys (`id String @id @default(cuid())`).
- **Timestamps**: Always include `createdAt` and `updatedAt`.
- **Relations**: Explicitly name relation fields for clarity.

**Example Model:**
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

### 2. Migration & Synchronization
- **Prototyping**: Use `npx prisma db push` for rapid iteration during development.
- **Production Leads**: Use `npx prisma migrate dev --name <descriptive-name>` to create versioned migrations.
- **Client Generation**: Always run `npx prisma generate` after schema changes to update the TypeScript client.

### 3. Type-Safe Querying

Leverage Prisma's generated types to ensure type safety throughout the application.

**Transactional Writes:**
Use `$transaction` for dependent writes.
```ts
const [user, post] = await prisma.$transaction([
  prisma.user.create({ data: { ... } }),
  prisma.post.create({ data: { ... } }),
]);
```

**Efficient Reads:**
Select only what you need.
```ts
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    posts: {
      take: 5,
      select: { title: true }
    }
  }
});
```

## Best Practices

1.  **Enums**: Use formatted Enums for state (e.g., `Status` vs `status`).
2.  **Indexes**: Add `@@index` on fields frequently used in `where` clauses (foreign keys are indexed automatically in some DBs, but explicit is better for clarity).
3.  **Soft Deletes**: Consider adding a `deletedAt DateTime?` field if data recovery is critical, rather than hard deleting.

## Error Handling

Wrap Prisma calls in try-catch blocks and check for specific error codes (e.g., `P2002` for unique constraint violations).

```ts
import { Prisma } from '@prisma/client';

try {
  // ... query
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      console.error('Unique constraint violation');
    }
  }
  throw e;
}
```
