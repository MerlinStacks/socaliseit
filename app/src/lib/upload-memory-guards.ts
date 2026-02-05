/**
 * Upload Memory Guards
 * Prevents memory exhaustion during large file uploads.
 *
 * Why: Users uploading 4K videos (500MB+) can exhaust server memory if
 * loaded entirely into RAM. These guards enforce streaming and size limits.
 */

import { logger } from '@/lib/logger';

/** Maximum file size for in-memory processing (50MB) */
export const MAX_MEMORY_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum total upload size per request (500MB) */
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

/** Chunk size for streaming uploads (5MB) */
export const STREAM_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Check if a file should be streamed rather than loaded into memory.
 *
 * @param sizeBytes - File size in bytes
 * @returns true if file should be streamed
 */
export function shouldStreamUpload(sizeBytes: number): boolean {
    return sizeBytes > MAX_MEMORY_SIZE_BYTES;
}

/**
 * Validate upload size before processing.
 * Throws an error if size exceeds limits.
 *
 * @param sizeBytes - File size in bytes
 * @param filename - For error messages
 */
export function validateUploadSize(sizeBytes: number, filename: string): void {
    if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        const maxMB = (MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)).toFixed(0);
        throw new UploadSizeError(
            `File "${filename}" (${sizeMB}MB) exceeds maximum size of ${maxMB}MB`
        );
    }
}

/**
 * Check current memory usage and warn if high.
 *
 * @returns Memory usage info
 */
export function checkMemoryUsage(): {
    heapUsedMB: number;
    heapTotalMB: number;
    percentUsed: number;
    isHighUsage: boolean;
} {
    const used = process.memoryUsage();
    const heapUsedMB = used.heapUsed / (1024 * 1024);
    const heapTotalMB = used.heapTotal / (1024 * 1024);
    const percentUsed = (used.heapUsed / used.heapTotal) * 100;
    const isHighUsage = percentUsed > 80;

    if (isHighUsage) {
        logger.warn({ heapUsedMB, heapTotalMB, percentUsed }, 'High memory usage detected');
    }

    return { heapUsedMB, heapTotalMB, percentUsed, isHighUsage };
}

/**
 * Estimate memory needed for an upload operation.
 *
 * @param fileSizeBytes - Size of file being uploaded
 * @param concurrent - Number of concurrent uploads
 * @returns Estimated memory in bytes
 */
export function estimateMemoryNeeded(fileSizeBytes: number, concurrent: number = 1): number {
    // Files under memory limit are fully buffered
    // Files over are streamed in chunks
    const perFileMemory = shouldStreamUpload(fileSizeBytes)
        ? STREAM_CHUNK_SIZE * 2 // Double-buffering for streaming
        : fileSizeBytes;

    return perFileMemory * concurrent;
}

/**
 * Check if we can safely accept an upload given current memory.
 *
 * @param fileSizeBytes - Size of incoming file
 * @returns true if upload can proceed
 */
export function canAcceptUpload(fileSizeBytes: number): boolean {
    const { percentUsed } = checkMemoryUsage();
    const estimatedNeed = estimateMemoryNeeded(fileSizeBytes);
    const estimatedNeedMB = estimatedNeed / (1024 * 1024);

    // Reject if we're already at high usage and file is large
    if (percentUsed > 80 && estimatedNeedMB > 50) {
        logger.warn({ percentUsed, estimatedNeedMB }, 'Rejecting upload due to memory pressure');
        return false;
    }

    // Reject if we're critically low
    if (percentUsed > 95) {
        logger.error({ percentUsed }, 'Critical memory usage, rejecting all uploads');
        return false;
    }

    return true;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Custom error for upload size violations.
 */
export class UploadSizeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UploadSizeError';
    }
}
