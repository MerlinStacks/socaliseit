/**
 * Perceptual Image Hash Utility
 * 
 * Why: Generates a compact fingerprint (pHash) of image content for duplicate detection.
 * Two images that are resized versions of each other produce identical or very similar hashes.
 * 
 * How it works:
 * 1. Resize image to 8×8 grayscale (64 pixels)
 * 2. Compute the mean pixel value
 * 3. Build a 64-bit hash: each bit is 1 if that pixel is >= mean, else 0
 * 4. Return as a 16-char hex string
 * 
 * No new dependencies — uses `sharp` which is already installed.
 */

import sharp from 'sharp';
import { logger } from '@/lib/logger';

const HASH_SIZE = 8; // 8×8 = 64 bits = 16 hex chars

/**
 * Compute a perceptual hash for an image file.
 * Returns a 16-character hex string, or null if hashing fails.
 * 
 * Why nullable: We don't want a hash failure to block an upload.
 * Videos and non-image files return null by design.
 */
export async function computeImageHash(filePath: string): Promise<string | null> {
    try {
        // Resize to 8×8 grayscale — strips all detail except visual structure
        const { data } = await sharp(filePath)
            .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Compute mean pixel value
        const pixels = new Uint8Array(data);
        const mean = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;

        // Build 64-bit hash: 1 if pixel >= mean, 0 otherwise
        let hashBits = '';
        for (let i = 0; i < pixels.length; i++) {
            hashBits += pixels[i] >= mean ? '1' : '0';
        }

        // Convert binary string to hex (16 chars for 64 bits)
        const hex = BigInt(`0b${hashBits}`).toString(16).padStart(16, '0');
        return hex;
    } catch (error) {
        logger.warn({ error, filePath }, 'Failed to compute image hash — skipping');
        return null;
    }
}

/**
 * Compare two perceptual hashes and return the Hamming distance.
 * Lower distance = more similar. 0 = identical content.
 * 
 * Typical thresholds:
 * - 0-5:  Same image (different size/compression)
 * - 6-10: Visually similar (e.g., slight crop)
 * - 10+:  Different images
 */
export function hashDistance(hashA: string, hashB: string): number {
    if (hashA.length !== hashB.length) return 64; // Max distance

    const bitsA = BigInt(`0x${hashA}`);
    const bitsB = BigInt(`0x${hashB}`);
    let xor = bitsA ^ bitsB;

    // Count the number of 1-bits (Hamming weight)
    let distance = 0;
    while (xor > BigInt(0)) {
        distance += Number(xor & BigInt(1));
        xor >>= BigInt(1);
    }

    return distance;
}
