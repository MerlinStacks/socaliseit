/**
 * Image Compression Utility
 * Client-side image compression before upload using browser-image-compression.
 *
 * Why: Reduce upload time and storage usage by compressing images client-side.
 */

import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    useWebWorker?: boolean;
    onProgress?: (progress: number) => void;
}

export interface CompressionResult {
    file: File;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    wasCompressed: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
    maxSizeMB: 2,
    maxWidthOrHeight: 4096,
    useWebWorker: true,
};

/**
 * Compress an image file if it exceeds the threshold.
 * Videos and other file types are passed through unchanged.
 */
export async function compressImage(
    file: File,
    options: CompressionOptions = {}
): Promise<CompressionResult> {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const originalSize = file.size;

    // Skip non-image files
    if (!file.type.startsWith('image/')) {
        return {
            file,
            originalSize,
            compressedSize: originalSize,
            compressionRatio: 1,
            wasCompressed: false,
        };
    }

    // Skip if already under threshold (1MB default)
    const thresholdBytes = (mergedOptions.maxSizeMB || 2) * 1024 * 1024;
    if (file.size < thresholdBytes * 0.5) {
        return {
            file,
            originalSize,
            compressedSize: originalSize,
            compressionRatio: 1,
            wasCompressed: false,
        };
    }

    // Skip GIFs (compression loses animation)
    if (file.type === 'image/gif') {
        return {
            file,
            originalSize,
            compressedSize: originalSize,
            compressionRatio: 1,
            wasCompressed: false,
        };
    }

    try {
        const compressedFile = await imageCompression(file, {
            maxSizeMB: mergedOptions.maxSizeMB,
            maxWidthOrHeight: mergedOptions.maxWidthOrHeight,
            useWebWorker: mergedOptions.useWebWorker,
            onProgress: mergedOptions.onProgress,
        });

        const compressedSize = compressedFile.size;
        const compressionRatio = originalSize / compressedSize;

        // Only use compressed version if it's actually smaller
        if (compressedSize < originalSize) {
            return {
                file: compressedFile,
                originalSize,
                compressedSize,
                compressionRatio,
                wasCompressed: true,
            };
        }

        return {
            file,
            originalSize,
            compressedSize: originalSize,
            compressionRatio: 1,
            wasCompressed: false,
        };
    } catch (error) {
        console.warn('Image compression failed, using original:', error);
        return {
            file,
            originalSize,
            compressedSize: originalSize,
            compressionRatio: 1,
            wasCompressed: false,
        };
    }
}

/**
 * Compress multiple files in parallel.
 */
export async function compressImages(
    files: File[],
    options: CompressionOptions = {}
): Promise<CompressionResult[]> {
    return Promise.all(files.map((file) => compressImage(file, options)));
}

/**
 * Format bytes to human-readable size.
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
