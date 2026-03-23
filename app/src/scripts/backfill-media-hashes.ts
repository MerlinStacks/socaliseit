/**
 * Backfill Script: Media Content Hashes & Source Links
 * 
 * Why: Existing media records have no contentHash or sourceMediaId.
 * This script computes perceptual hashes for existing images and
 * links resized copies (filename starts with "resized-") to their originals.
 * 
 * Usage: npx tsx src/scripts/backfill-media-hashes.ts
 * 
 * Safe to run multiple times — skips records that already have values.
 */

import { db } from '@/lib/db';
import { computeImageHash } from '@/lib/media/image-hash';
import path from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

async function backfill() {
    console.log('🔍 Starting media backfill...\n');

    // Step 1: Compute contentHash for images without one
    const imagesWithoutHash = await db.media.findMany({
        where: {
            contentHash: null,
            mimeType: { startsWith: 'image/' },
        },
        select: { id: true, url: true, filename: true },
    });

    console.log(`📷 Found ${imagesWithoutHash.length} images needing content hash`);

    let hashCount = 0;
    for (const img of imagesWithoutHash) {
        const filename = path.basename(img.url.replace('/api/uploads/', ''));
        const filePath = path.join(UPLOAD_DIR, filename);

        if (!existsSync(filePath)) {
            console.log(`  ⚠ Skipping ${img.filename} — file not found on disk`);
            continue;
        }

        const hash = await computeImageHash(filePath);
        if (hash) {
            await db.media.update({
                where: { id: img.id },
                data: { contentHash: hash },
            });
            hashCount++;
        }
    }
    console.log(`  ✅ Computed ${hashCount} content hashes\n`);

    // Step 2: Link resized copies to originals via sourceMediaId
    const resizedMedia = await db.media.findMany({
        where: {
            sourceMediaId: null,
            filename: { startsWith: 'resized-' },
        },
        select: { id: true, filename: true, organizationId: true },
    });

    console.log(`🔗 Found ${resizedMedia.length} resized copies to link`);

    let linkCount = 0;
    for (const resized of resizedMedia) {
        // Strip "resized-" prefix to find original filename
        const originalFilename = resized.filename.replace(/^resized-/, '');

        const original = await db.media.findFirst({
            where: {
                organizationId: resized.organizationId,
                filename: originalFilename,
                sourceMediaId: null, // Must itself be an original
            },
            select: { id: true, contentHash: true },
        });

        if (original) {
            await db.media.update({
                where: { id: resized.id },
                data: {
                    sourceMediaId: original.id,
                    contentHash: original.contentHash,
                },
            });
            linkCount++;
        }
    }
    console.log(`  ✅ Linked ${linkCount} resized copies to originals\n`);

    console.log('✨ Backfill complete!');
}

backfill()
    .catch((err) => {
        console.error('❌ Backfill failed:', err);
        process.exit(1);
    })
    .finally(() => db.$disconnect());
