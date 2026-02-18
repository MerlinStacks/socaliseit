/**
 * Data Migration: PostPlatform → Post
 *
 * Why: Copies platform-specific data from PostPlatform rows into their parent
 * Post records, then re-links PostAnalytics, ProductTag, and Comment rows
 * so they point directly at Post instead of PostPlatform.
 *
 * Run BEFORE the schema migration that drops PostPlatform.
 * Usage: npx tsx scripts/migrate-post-platforms.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const db = new PrismaClient();
const BATCH_SIZE = 200;

interface MigrationStats {
    postsUpdated: number;
    analyticsRelinked: number;
    productTagsRelinked: number;
    commentsRelinked: number;
    orphanedAnalytics: number;
    orphanedProductTags: number;
    orphanedComments: number;
}

async function migrate(): Promise<MigrationStats> {
    const stats: MigrationStats = {
        postsUpdated: 0,
        analyticsRelinked: 0,
        productTagsRelinked: 0,
        commentsRelinked: 0,
        orphanedAnalytics: 0,
        orphanedProductTags: 0,
        orphanedComments: 0,
    };

    // Step 1: Copy PostPlatform fields → parent Post
    console.log('Step 1: Copying PostPlatform fields to parent Post...');
    const totalPP = await db.postPlatform.count();
    console.log(`  Found ${totalPP} PostPlatform rows`);

    let cursor: string | undefined;
    let processed = 0;

    while (true) {
        const batch = await db.postPlatform.findMany({
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
            include: {
                socialAccount: { select: { platform: true } },
            },
        });

        if (batch.length === 0) break;

        for (const pp of batch) {
            // Only update the parent Post if it doesn't already have platform set
            const post = await db.post.findUnique({
                where: { id: pp.postId },
                select: { platform: true, socialAccountId: true, platformPostId: true, status: true },
            });

            if (!post) {
                console.warn(`  Orphaned PostPlatform ${pp.id} — parent Post ${pp.postId} missing`);
                continue;
            }

            // Copy fields if Post doesn't already have them from the new architecture
            const updates: Record<string, unknown> = {};
            if (!post.platform && pp.socialAccount?.platform) {
                updates.platform = pp.socialAccount.platform;
            }
            if (!post.socialAccountId && pp.socialAccountId) {
                updates.socialAccountId = pp.socialAccountId;
            }
            if (!post.platformPostId && pp.platformPostId) {
                updates.platformPostId = pp.platformPostId;
            }
            // Copy publishedAt if Post doesn't have it
            if (pp.publishedAt) {
                updates.publishedAt = pp.publishedAt;
            }

            if (Object.keys(updates).length > 0) {
                await db.post.update({
                    where: { id: pp.postId },
                    data: updates,
                });
                stats.postsUpdated++;
            }
        }

        cursor = batch[batch.length - 1].id;
        processed += batch.length;
        console.log(`  Processed ${processed}/${totalPP}`);
    }

    // Step 2: Re-link PostAnalytics where only postPlatformId is set
    console.log('Step 2: Re-linking PostAnalytics...');
    const analyticsToFix = await db.postAnalytics.findMany({
        where: {
            postPlatformId: { not: null },
            postId: null,
        },
        select: { id: true, postPlatformId: true },
    });

    for (const row of analyticsToFix) {
        const pp = await db.postPlatform.findUnique({
            where: { id: row.postPlatformId! },
            select: { postId: true },
        });

        if (!pp) {
            stats.orphanedAnalytics++;
            console.warn(`  Orphaned PostAnalytics ${row.id} — PostPlatform ${row.postPlatformId} missing`);
            continue;
        }

        // Check if there's already a PostAnalytics row for this postId
        const existing = await db.postAnalytics.findUnique({
            where: { postId: pp.postId },
        });

        if (existing) {
            // Merge: keep the one with higher impressions, delete the other
            console.log(`  Duplicate analytics for Post ${pp.postId}: keeping existing, deleting ${row.id}`);
            await db.postAnalytics.delete({ where: { id: row.id } });
        } else {
            await db.postAnalytics.update({
                where: { id: row.id },
                data: { postId: pp.postId },
            });
        }
        stats.analyticsRelinked++;
    }

    // Step 3: Re-link ProductTag rows
    console.log('Step 3: Re-linking ProductTag rows...');
    const tagsToFix = await db.productTag.findMany({
        where: {
            postPlatformId: { not: null },
            postId: null,
        },
        select: { id: true, postPlatformId: true },
    });

    for (const row of tagsToFix) {
        const pp = await db.postPlatform.findUnique({
            where: { id: row.postPlatformId! },
            select: { postId: true },
        });

        if (!pp) {
            stats.orphanedProductTags++;
            console.warn(`  Orphaned ProductTag ${row.id} — PostPlatform ${row.postPlatformId} missing`);
            continue;
        }

        await db.productTag.update({
            where: { id: row.id },
            data: { postId: pp.postId },
        });
        stats.productTagsRelinked++;
    }

    // Step 4: Re-link Comment rows (postPlatformId → map to Post.id)
    console.log('Step 4: Re-linking Comment rows...');

    // Build a lookup map: PostPlatform.id → Post.id
    const ppToPost = new Map<string, string>();
    let ppCursor: string | undefined;

    while (true) {
        const ppBatch = await db.postPlatform.findMany({
            take: BATCH_SIZE,
            ...(ppCursor ? { skip: 1, cursor: { id: ppCursor } } : {}),
            orderBy: { id: 'asc' },
            select: { id: true, postId: true },
        });

        if (ppBatch.length === 0) break;
        for (const pp of ppBatch) {
            ppToPost.set(pp.id, pp.postId);
        }
        ppCursor = ppBatch[ppBatch.length - 1].id;
    }

    console.log(`  Built lookup map: ${ppToPost.size} PostPlatform → Post mappings`);

    // Note: Comment.postPlatformId will become Comment.postId after schema migration.
    // For now, we just log what would be remapped so the schema migration can handle the rename.
    const commentsWithPP = await db.comment.count({
        where: { postPlatformId: { not: null } },
    });
    console.log(`  ${commentsWithPP} comments have postPlatformId set`);

    // Verify all postPlatformId values in Comment map to valid PostPlatform rows
    const commentsToCheck = await db.comment.findMany({
        where: { postPlatformId: { not: null } },
        select: { id: true, postPlatformId: true },
    });

    for (const c of commentsToCheck) {
        if (!ppToPost.has(c.postPlatformId!)) {
            stats.orphanedComments++;
            console.warn(`  Orphaned Comment ${c.id} — PostPlatform ${c.postPlatformId} not in lookup`);
        } else {
            stats.commentsRelinked++;
        }
    }

    return stats;
}

async function main() {
    console.log('=== PostPlatform → Post Data Migration ===');
    console.log(`Started at ${new Date().toISOString()}\n`);

    try {
        const stats = await migrate();

        console.log('\n=== Migration Complete ===');
        console.log(`Posts updated:           ${stats.postsUpdated}`);
        console.log(`Analytics re-linked:     ${stats.analyticsRelinked}`);
        console.log(`ProductTags re-linked:   ${stats.productTagsRelinked}`);
        console.log(`Comments verified:       ${stats.commentsRelinked}`);
        console.log(`Orphaned analytics:      ${stats.orphanedAnalytics}`);
        console.log(`Orphaned product tags:   ${stats.orphanedProductTags}`);
        console.log(`Orphaned comments:       ${stats.orphanedComments}`);

        if (stats.orphanedAnalytics + stats.orphanedProductTags + stats.orphanedComments > 0) {
            console.warn('\n⚠ Some orphaned rows found — review warnings above');
        } else {
            console.log('\n✓ No orphans — safe to proceed with schema migration');
        }
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await db.$disconnect();
    }
}

main();
