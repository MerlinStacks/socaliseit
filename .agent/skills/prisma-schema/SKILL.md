---
name: prisma-schema
description: How to safely modify the Prisma schema, run migrations, and follow multi-tenancy conventions
---

# Prisma Schema Modifications

Use this skill when adding models, fields, enums, or indexes to the database.

## Key Facts

| Item | Value |
|------|-------|
| Schema path | `app/prisma/schema.prisma` |
| Generator | `prisma-client` → `../src/generated/prisma` |
| Database | PostgreSQL 16 |
| Prisma version | 7.3 (driver adapter, no `url` in datasource) |
| DB connection | `src/lib/db.ts` (passes URL to PrismaClient constructor) |

---

## Conventions

### Model ID Pattern
Every model uses `cuid()` IDs:
```prisma
model Example {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Multi-Tenancy
**Every user-facing entity must have `organizationId`** and a relation to `Organization`:
```prisma
model Widget {
  id             String       @id @default(cuid())
  organizationId String
  // ... fields
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])
}
```

Then add the reverse relation array to the `Organization` model:
```prisma
model Organization {
  // ... existing relations
  widgets Widget[]
}
```

### Relationship Delete Behavior
- **Parent → Child** (org owns resource): `onDelete: Cascade`
- **Reference** (post → socialAccount): `onDelete: SetNull`
- **Never** use `onDelete: Restrict` unless there's a documented reason

### Index Strategy
Always add indexes for:
1. `organizationId` (tenant isolation)
2. Foreign keys used in WHERE clauses
3. Composite indexes for common query patterns: `@@index([organizationId, status])`
4. Unique constraints where duplicates would cause bugs: `@@unique([organizationId, name])`

### Enum Naming
- SCREAMING_SNAKE_CASE values: `INSTAGRAM`, `GOOGLE_BUSINESS`
- Enum names are PascalCase: `Platform`, `PostStatus`

---

## Workflow

### Adding a New Field
```powershell
# 1. Edit schema.prisma
# 2. Create migration
cd app
npx prisma migrate dev --name add-widget-color

# 3. Regenerate client
npx prisma generate
```

### Adding a New Model
1. Define the model in `schema.prisma` with `organizationId` + relation
2. Add the reverse relation to `Organization`
3. Run `npx prisma migrate dev --name create-widget`
4. Run `npx prisma generate`
5. Use `db.widget` in API routes

### Modifying an Enum
```powershell
# After adding a value to the enum in schema.prisma:
cd app
npx prisma migrate dev --name add-platform-threads
npx prisma generate
```

> [!WARNING]
> **Removing** enum values requires data migration first. Never remove an enum value if rows reference it.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Forgetting `@@index([organizationId])` | Every org-scoped model needs this |
| Adding `@unique` on non-unique data | Use `@@unique` composites instead |
| Breaking a relation by renaming a field | Create a new migration that renames at DB level |
| Forgetting to add reverse relation on `Organization` | Schema won't compile — add `modelName ModelName[]` |
| Using `@default(uuid())` | Project uses `@default(cuid())` everywhere |

## Reference Files

| Purpose | Path |
|---------|------|
| Schema | `app/prisma/schema.prisma` |
| DB client | `app/src/lib/db.ts` |
| Prisma config | `app/prisma.config.ts` |
| Migrations | `app/prisma/migrations/` |
