---
name: api-route
description: How to create or modify Next.js App Router API routes following project auth, validation, and error conventions
---

# API Route Conventions

Use this skill when creating or modifying API routes in `src/app/api/`.

## File Placement

```
src/app/api/<resource>/route.ts          → Collection (GET list, POST create)
src/app/api/<resource>/[id]/route.ts     → Single item (GET, PUT/PATCH, DELETE)
src/app/api/<resource>/[id]/<sub>/route.ts → Sub-resource
```

---

## Standard Route Template

Every route follows this pattern:

```typescript
/**
 * <Resource> API Routes
 * <Brief description of what this handles>
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/<resource> - List <resources> for current organization
 */
export async function GET(request: NextRequest) {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 3. Query with org scoping
    const [items, total] = await Promise.all([
        db.resource.findMany({
            where: { organizationId },
            take: limit,
            skip: offset,
            orderBy: { createdAt: 'desc' },
        }),
        db.resource.count({ where: { organizationId } }),
    ]);

    // 4. Return paginated response
    return NextResponse.json({ items, total, limit, offset });
}

/**
 * POST /api/<resource> - Create a new <resource>
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;

    // Parse body safely
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate required fields
    const { name } = body;
    if (!name?.trim()) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Create with org scoping
    const item = await db.resource.create({
        data: { organizationId, name: name.trim() },
    });

    return NextResponse.json(item, { status: 201 });
}
```

---

## Conventions

### Auth Pattern
- Always use `const session = await auth()` (from `@/lib/auth`)
- Check `session?.user?.currentOrganizationId` — this is the active tenant
- For admin routes, also check `session.user.isSuperAdmin`

### Error Responses
```typescript
// Standard error shape
return NextResponse.json({ error: 'Human-readable message' }, { status: 4XX });
```

Status codes used:
- `400` — validation failure
- `401` — not authenticated
- `403` — authenticated but not authorized
- `404` — resource not found (or not in this org)
- `409` — conflict (duplicate)
- `429` — rate limited

### Organization Scoping
**Every query MUST include `organizationId` in the WHERE clause.** This prevents data leaks between tenants:
```typescript
// CORRECT
db.post.findMany({ where: { organizationId, id: postId } })

// WRONG — leaks data across orgs
db.post.findMany({ where: { id: postId } })
```

### Body Parsing
Always wrap `request.json()` in try/catch:
```typescript
let body;
try { body = await request.json(); }
catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
```

### Dynamic Route Params
For `[id]` routes in Next.js App Router, params are accessed via the second argument:
```typescript
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    // ...
}
```

### Logging
- Use `logger` from `@/lib/logger` — never `console.log`
- Log at `info` for successful operations, `error` for failures
- Include structured context: `logger.info({ postId, action: 'created' }, 'Post created')`

### Sanitization
- Use `sanitizeForDb()` from `@/lib/sanitize-string` for user-provided text stored in activity logs
- Use `sanitizeString()` for general input cleaning

### Cache Invalidation
After mutations, invalidate relevant caches:
```typescript
const { invalidatePostCaches } = await import('@/lib/cache');
invalidatePostCaches(organizationId);
```

---

## Reference Files

| Purpose | Path |
|---------|------|
| Auth helper | `src/lib/auth.ts` |
| DB client | `src/lib/db.ts` |
| Logger | `src/lib/logger.ts` |
| Posts route (large example) | `src/app/api/posts/route.ts` |
| Single item route | `src/app/api/posts/[id]/route.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| API error helpers | `src/lib/api-error.ts` |
| Sanitization | `src/lib/sanitize-string.ts` |
| Cache helpers | `src/lib/cache.ts` |
