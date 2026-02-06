/**
 * PWA File Handler Utilities
 * Validates and processes files from PWA file handlers and share target
 * 
 * Why: PWA can receive files from the OS file handler API.
 * We need to validate size/type before processing to prevent memory issues.
 */

/** Maximum file size in bytes (50MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum total upload size (100MB) */
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

/** Allowed media MIME types */
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);

export interface FileValidationResult {
    valid: boolean;
    error?: string;
    file?: File;
}

export interface FileValidationOptions {
    maxSize?: number;
    allowedTypes?: Set<string>;
}

/**
 * Validate a single file for size and type
 */
export function validateFile(
    file: File,
    options: FileValidationOptions = {}
): FileValidationResult {
    const maxSize = options.maxSize ?? MAX_FILE_SIZE;
    const allowedTypes = options.allowedTypes ?? ALLOWED_MIME_TYPES;

    if (file.size > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        const fileMB = (file.size / (1024 * 1024)).toFixed(1);
        return {
            valid: false,
            error: `File "${file.name}" is too large (${fileMB}MB). Maximum size is ${maxMB}MB.`,
        };
    }

    if (!allowedTypes.has(file.type)) {
        return {
            valid: false,
            error: `File "${file.name}" has unsupported type (${file.type || 'unknown'}).`,
        };
    }

    return { valid: true, file };
}

/**
 * Validate multiple files (from file picker or drag-drop)
 */
export function validateFiles(
    files: FileList | File[],
    options: FileValidationOptions = {}
): { valid: File[]; errors: string[] } {
    const fileArray = Array.from(files);
    const valid: File[] = [];
    const errors: string[] = [];

    let totalSize = 0;

    for (const file of fileArray) {
        const result = validateFile(file, options);
        if (result.valid && result.file) {
            totalSize += result.file.size;
            if (totalSize > MAX_TOTAL_SIZE) {
                errors.push(`Total upload size exceeds ${Math.round(MAX_TOTAL_SIZE / (1024 * 1024))}MB limit.`);
                break;
            }
            valid.push(result.file);
        } else if (result.error) {
            errors.push(result.error);
        }
    }

    return { valid, errors };
}

/**
 * Process files from PWA file handler (launchQueue)
 * Called when files are opened directly with the PWA
 */
export async function processLaunchQueueFiles(
    launchParams: { files?: FileSystemFileHandle[] }
): Promise<{ files: File[]; errors: string[] }> {
    if (!launchParams.files || launchParams.files.length === 0) {
        return { files: [], errors: [] };
    }

    const files: File[] = [];
    const errors: string[] = [];

    for (const handle of launchParams.files) {
        try {
            const file = await handle.getFile();
            const result = validateFile(file);
            if (result.valid && result.file) {
                files.push(result.file);
            } else if (result.error) {
                errors.push(result.error);
            }
        } catch (error) {
            errors.push(`Failed to read file: ${handle.name}`);
        }
    }

    return { files, errors };
}

/**
 * Decode shared text with proper UTF-8 handling
 * Why: URL params may be double-encoded or have incorrect encoding
 */
export function decodeSharedText(text: string | null): string {
    if (!text) return '';

    try {
        // Try decoding as URI component first
        let decoded = decodeURIComponent(text);

        // Check if it was double-encoded
        if (decoded.includes('%')) {
            try {
                decoded = decodeURIComponent(decoded);
            } catch {
                // Single encoded, use as is
            }
        }

        return decoded;
    } catch {
        // Return original if decoding fails
        return text;
    }
}

/**
 * Parse share target params with proper encoding
 */
export function parseShareParams(searchParams: URLSearchParams): {
    title: string;
    text: string;
    url: string;
} {
    return {
        title: decodeSharedText(searchParams.get('title')),
        text: decodeSharedText(searchParams.get('text')),
        url: decodeSharedText(searchParams.get('url')),
    };
}
