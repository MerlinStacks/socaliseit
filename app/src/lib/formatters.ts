/**
 * Centralized Formatting Utilities
 * Why: Consolidates duplicate formatters from video-editor and compose components
 */

/**
 * Formats a Date object to readable string (e.g., "Jan 15, 2025")
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Formats frame count to timecode string (HH:MM:SS:FF)
 * @param frame - The frame number
 * @param fps - Frames per second (default 30)
 * @returns Formatted timecode string
 */
export function formatTimecode(frame: number, fps: number = 30): string {
    const totalSeconds = Math.floor(frame / fps);
    const frames = frame % fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

/**
 * Formats seconds to human-readable duration (MM:SS or HH:MM:SS)
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds?: number): string {
    if (seconds === undefined || seconds === null) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hours = Math.floor(mins / 60);

    if (hours > 0) {
        return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats 24h time string to 12h format with AM/PM
 * @param time - Time in 24h format (e.g., "14:30")
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Formats a number with locale-aware separators
 * @param value - Number to format
 * @returns Formatted number string
 */
export function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
}

/**
 * Formats bytes to human-readable file size
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);

    return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Formats a percentage value
 * @param value - Decimal value (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default 0)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number, decimals: number = 0): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Formats ISO date string to relative time (e.g., "2h ago", "3d ago")
 * @param iso - ISO date string
 * @returns Formatted relative time string
 */
export function formatRelativeTime(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

/**
 * Formats large numbers to compact form (e.g., 1.2K, 3.5M)
 * @param value - Number to format
 * @returns Compact formatted string
 */
export function formatCompact(value: number): string {
    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
}
