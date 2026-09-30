/** Storage limits; platform-specific publishing limits are validated separately. */
export const MAX_VIDEO_UPLOAD_SIZE = 1024 * 1024 * 1024;
export const MAX_OTHER_UPLOAD_SIZE = 100 * 1024 * 1024;

export function getUploadSizeLimit(mimeType: string): number {
    return mimeType.startsWith('video/') ? MAX_VIDEO_UPLOAD_SIZE : MAX_OTHER_UPLOAD_SIZE;
}

export function uploadSizeError(mimeType: string): string {
    return `File too large. Maximum ${mimeType.startsWith('video/') ? '1 GB' : '100 MB'} allowed.`;
}
