# Analytics Database Partitioning Strategy

> **Status**: Planning Document (P2)  
> **Target Implementation**: Q3 2026  
> **Author**: AI Assistant  
> **Last Updated**: January 2026

## Executive Summary

As SocialiseIT scales to support thousands of workspaces with millions of analytics data points, the current monolithic table structure for `PlatformAnalytics` and `PostAnalytics` will become a performance bottleneck. This document outlines a partitioning strategy to ensure continued performance and cost-effectiveness.

## Current State

### Tables at Risk

| Table | Row Growth Rate | Estimated Rows (12 months) | Query Pattern |
|-------|-----------------|---------------------------|---------------|
| `PlatformAnalytics` | ~50K/day | 18M+ | Date range + workspace |
| `PostAnalytics` | ~100K/day | 36M+ | Date range + post |

### Current Schema (Prisma)

```prisma
model PlatformAnalytics {
  id              String   @id @default(cuid())
  workspaceId     String
  socialAccountId String
  date            DateTime @db.Date
  followers       Int      @default(0)
  // ... other metrics
  
  @@unique([socialAccountId, date])
  @@index([workspaceId, date])
  @@index([socialAccountId, date])
}
```

### Pain Points at Scale

1. **Query Performance**: Full table scans for date-range queries
2. **Index Size**: B-tree indexes grow with total rows
3. **Vacuum Overhead**: Large tables have long maintenance windows
4. **Backup Time**: Full table backups become impractical

---

## Proposed Solution: Time-Based Range Partitioning

### Partitioning Scheme

Partition analytics tables by **month** based on the `date` column.

```sql
-- Example: PlatformAnalytics partitioned by month
CREATE TABLE platform_analytics (
    id              TEXT NOT NULL,
    workspace_id    TEXT NOT NULL,
    social_account_id TEXT NOT NULL,
    date            DATE NOT NULL,
    followers       INTEGER DEFAULT 0,
    followers_change INTEGER DEFAULT 0,
    following       INTEGER DEFAULT 0,
    impressions     INTEGER DEFAULT 0,
    reach           INTEGER DEFAULT 0,
    engagement_rate FLOAT DEFAULT 0,
    profile_views   INTEGER DEFAULT 0,
    website_clicks  INTEGER DEFAULT 0,
    email_clicks    INTEGER DEFAULT 0,
    platform_metrics JSONB,
    synced_at       TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (id, date),
    UNIQUE (social_account_id, date)
) PARTITION BY RANGE (date);

-- Create partitions for 2026
CREATE TABLE platform_analytics_2026_01 PARTITION OF platform_analytics
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE platform_analytics_2026_02 PARTITION OF platform_analytics
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... continue for each month
```

### Benefits

| Benefit | Impact |
|---------|--------|
| **Partition Pruning** | 90%+ reduction in scanned rows for date queries |
| **Smaller Indexes** | Each partition has its own index, faster lookups |
| **Efficient Cleanup** | Drop old partitions instead of DELETE |
| **Parallel Vacuum** | Partitions vacuum independently |
| **Targeted Backups** | Backup only recent partitions |

---

## Implementation Phases

### Phase 1: Infrastructure Preparation (Week 1-2)

1. **Create partition management functions**
   ```sql
   CREATE OR REPLACE FUNCTION create_monthly_partition(
       table_name TEXT,
       partition_date DATE
   ) RETURNS VOID AS $$
   DECLARE
       start_date DATE := date_trunc('month', partition_date)::date;
       end_date DATE := (start_date + interval '1 month')::date;
       partition_name TEXT := table_name || '_' || to_char(start_date, 'YYYY_MM');
   BEGIN
       EXECUTE format(
           'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
           partition_name,
           table_name,
           start_date,
           end_date
       );
   END;
   $$ LANGUAGE plpgsql;
   ```

2. **Set up automatic partition creation job**
   - Create partitions 3 months in advance
   - Run weekly via pg_cron or BullMQ scheduled job

### Phase 2: Migration (Week 3-4)

1. **Create new partitioned tables** (as `_new` suffix)
2. **Migrate data in batches** using `INSERT ... SELECT`
3. **Add trigger for dual-write** during migration
4. **Switch over** atomic table rename
5. **Validate** row counts and query performance

### Phase 3: Retention Policy (Week 5)

Implement tiered data retention:

| Data Age | Storage Tier | Retention |
|----------|--------------|-----------|
| 0-3 months | Hot (PostgreSQL) | Full granularity |
| 3-12 months | Warm (PostgreSQL) | Daily aggregates |
| 12+ months | Cold (S3/Archive) | Monthly aggregates |

```sql
-- Daily aggregation job
INSERT INTO platform_analytics_aggregated_daily
SELECT 
    workspace_id,
    social_account_id,
    date,
    avg(engagement_rate) as avg_engagement,
    max(followers) as peak_followers,
    sum(impressions) as total_impressions
FROM platform_analytics
WHERE date < current_date - interval '3 months'
  AND NOT EXISTS (
      SELECT 1 FROM platform_analytics_aggregated_daily agg
      WHERE agg.date = platform_analytics.date
  )
GROUP BY workspace_id, social_account_id, date;
```

---

## Prisma Considerations

### Current Limitation

Prisma doesn't natively support PostgreSQL partitioning. Workarounds:

1. **Raw SQL Migrations**: Define partitions in raw SQL migration files
2. **Direct Database Management**: Handle partitions outside Prisma
3. **View Abstraction**: Create a view that Prisma queries

### Recommended Approach: Hybrid

```prisma
// Keep Prisma model for type safety
model PlatformAnalytics {
  id              String   @id @default(cuid())
  // ... fields
  
  @@map("platform_analytics_view") // Map to a view, not direct table
}
```

```sql
-- Create view that Prisma queries
CREATE VIEW platform_analytics_view AS
SELECT * FROM platform_analytics;

-- Prisma reads work normally
-- Writes go through the partitioned table
```

---

## Query Pattern Optimization

### Before (Current)

```sql
SELECT * FROM platform_analytics
WHERE workspace_id = $1
  AND date BETWEEN $2 AND $3;
-- Scans entire table
```

### After (Partitioned)

```sql
SELECT * FROM platform_analytics
WHERE workspace_id = $1
  AND date BETWEEN '2026-01-01' AND '2026-01-31';
-- Only scans 2026_01 partition due to partition pruning
```

### Ensuring Partition Pruning

1. **Always include date column in WHERE clause**
2. **Use literal date values** (not subqueries) when possible
3. **Keep date ranges within reasonable bounds**

---

## Monitoring & Alerts

### Key Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| Partition size | > 10GB | Review retention policy |
| Query time (p95) | > 500ms | Add indexes or adjust partitions |
| Missing partitions | Any | Alert, auto-create |
| Vacuum lag | > 24 hours | Increase vacuum frequency |

### Monitoring Queries

```sql
-- Partition sizes
SELECT 
    schemaname || '.' || tablename as partition,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
FROM pg_tables
WHERE tablename LIKE 'platform_analytics_%'
ORDER BY tablename;

-- Partition usage in queries
EXPLAIN (ANALYZE, BUFFERS) 
SELECT count(*) FROM platform_analytics
WHERE date BETWEEN '2026-01-01' AND '2026-01-31';
```

---

## Cost Considerations

### Storage Costs

| Tier | Storage Type | Cost (approx) |
|------|--------------|---------------|
| Hot | PostgreSQL | $0.125/GB/month |
| Warm | PostgreSQL (RO replica) | $0.10/GB/month |
| Cold | S3 Standard | $0.023/GB/month |

### Expected Savings

- **60% reduction** in hot storage after retention policy
- **Faster vacuums** reduce compute costs
- **Smaller backups** reduce storage and transfer costs

---

## Rollback Plan

If partitioning causes issues:

1. Keep original table structure for 30 days post-migration
2. Create trigger to dual-write back to original table
3. Switch application back to original table atomically
4. Investigate and re-attempt with fixes

---

## Next Steps

1. [ ] **Benchmark current query performance** (establish baseline)
2. [ ] **Set up staging environment** with production-like data
3. [ ] **Implement partition management functions**
4. [ ] **Test migration process on staging**
5. [ ] **Create monitoring dashboards**
6. [ ] **Schedule production migration window**

---

## References

- [PostgreSQL Partitioning Documentation](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Prisma with PostgreSQL Partitions](https://github.com/prisma/prisma/issues/3185)
- [pg_partman Extension](https://github.com/pgpartman/pg_partman)
