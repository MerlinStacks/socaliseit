/**
 * Bulk CSV Import Service
 * Import posts from spreadsheets
 */

export interface ImportRow {
    rowNumber: number;
    caption: string;
    mediaUrls?: string[];
    platforms: string[];
    scheduledAt?: Date;
    pillar?: string;
    hashtags?: string[];
    linkUrl?: string;
    status: 'valid' | 'warning' | 'error';
    errors: string[];
    warnings: string[];
}

export interface ImportJob {
    id: string;
    workspaceId: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
    status: 'parsing' | 'validating' | 'importing' | 'complete' | 'failed';
    progress: number;
    rows: ImportRow[];
    createdAt: Date;
    completedAt?: Date;
}

// Expected CSV columns
export const CSV_COLUMNS = {
    required: ['caption'],
    optional: ['platforms', 'scheduled_date', 'scheduled_time', 'pillar', 'hashtags', 'link', 'media_urls'],
};

// Sample CSV template
export const CSV_TEMPLATE = `caption,platforms,scheduled_date,scheduled_time,pillar,hashtags,link,media_urls
"New product launch! 🚀 Check it out!",instagram|tiktok,2024-02-01,10:00,Promotional,newproduct|launch|sale,https://example.com/product,https://example.com/image1.jpg
"Behind the scenes of our latest shoot 📸",instagram|facebook,2024-02-02,14:30,Behind the Scenes,bts|behindthescenes,,https://example.com/image2.jpg|https://example.com/image3.jpg
"Quick tip: How to style our bestseller ✨",instagram|tiktok|pinterest,2024-02-03,09:00,Educational,tips|howto|style,,`;

/**
 * Parse CSV file content
 */
export function parseCSV(content: string): ImportRow[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
        throw new Error('CSV must have header row and at least one data row');
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = mapCSVRow(headers, values, i + 1);
        rows.push(row);
    }

    return rows;
}

function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}

function mapCSVRow(headers: string[], values: string[], rowNumber: number): ImportRow {
    const errors: string[] = [];
    const warnings: string[] = [];

    const getValue = (key: string): string => {
        const index = headers.indexOf(key);
        return index >= 0 ? values[index] || '' : '';
    };

    // Parse caption
    const caption = getValue('caption');
    if (!caption) {
        errors.push('Caption is required');
    }

    // Parse platforms
    const platformsStr = getValue('platforms');
    const platforms = platformsStr ? platformsStr.split('|').map(p => p.trim().toLowerCase()) : ['instagram'];
    const validPlatforms = ['instagram', 'tiktok', 'facebook', 'youtube', 'pinterest'];
    platforms.forEach(p => {
        if (!validPlatforms.includes(p)) {
            warnings.push(`Unknown platform: ${p}`);
        }
    });

    // Parse scheduled date/time
    let scheduledAt: Date | undefined;
    const dateStr = getValue('scheduled_date');
    const timeStr = getValue('scheduled_time') || '12:00';
    if (dateStr) {
        try {
            const [year, month, day] = dateStr.split('-').map(Number);
            const [hours, minutes] = timeStr.split(':').map(Number);
            scheduledAt = new Date(year, month - 1, day, hours, minutes);

            if (scheduledAt < new Date()) {
                warnings.push('Scheduled date is in the past');
            }
        } catch {
            errors.push('Invalid date format. Use YYYY-MM-DD');
        }
    }

    // Parse hashtags
    const hashtagsStr = getValue('hashtags');
    const hashtags = hashtagsStr ? hashtagsStr.split('|').map(h => h.trim()) : [];

    // Parse media URLs
    const mediaUrlsStr = getValue('media_urls');
    const mediaUrls = mediaUrlsStr ? mediaUrlsStr.split('|').map(u => u.trim()).filter(Boolean) : [];

    // Validate media
    if (platforms.includes('tiktok') && mediaUrls.length === 0) {
        warnings.push('TikTok requires video content');
    }

    return {
        rowNumber,
        caption,
        mediaUrls,
        platforms,
        scheduledAt,
        pillar: getValue('pillar') || undefined,
        hashtags,
        linkUrl: getValue('link') || undefined,
        status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid',
        errors,
        warnings,
    };
}

/**
 * Create import job
 */
export async function createImportJob(
    workspaceId: string,
    fileName: string,
    content: string
): Promise<ImportJob> {
    const rows = parseCSV(content);

    const job: ImportJob = {
        id: `import_${Date.now()}`,
        workspaceId,
        fileName,
        totalRows: rows.length,
        validRows: rows.filter(r => r.status !== 'error').length,
        errorRows: rows.filter(r => r.status === 'error').length,
        status: 'validating',
        progress: 0,
        rows,
        createdAt: new Date(),
    };

    return job;
}

/**
 * Execute import job
 */
export async function executeImport(
    job: ImportJob,
    options: {
        skipErrors: boolean;
        defaultPlatforms?: string[];
        defaultPillar?: string;
    }
): Promise<{
    imported: number;
    skipped: number;
    failed: number;
    postIds: string[];
}> {
    const validRows = job.rows.filter(r =>
        options.skipErrors ? r.status !== 'error' : r.status === 'valid'
    );

    const postIds: string[] = [];
    let imported = 0;
    let failed = 0;

    for (const row of validRows) {
        try {
            // In production, create actual post
            const postId = `post_import_${row.rowNumber}_${Date.now()}`;
            postIds.push(postId);
            imported++;
        } catch {
            failed++;
        }
    }

    return {
        imported,
        skipped: job.totalRows - validRows.length,
        failed,
        postIds,
    };
}

/**
 * Download CSV template
 */
export function downloadTemplate(): void {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'socialiseit-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Export posts to CSV
 */
export async function exportPostsToCSV(
    posts: Array<{
        caption: string;
        platforms: string[];
        scheduledAt?: Date;
        pillar?: string;
        status: string;
    }>
): Promise<string> {
    const headers = ['caption', 'platforms', 'scheduled_date', 'scheduled_time', 'pillar', 'status'];
    const lines = [headers.join(',')];

    for (const post of posts) {
        const row = [
            `"${post.caption.replace(/"/g, '""')}"`,
            post.platforms.join('|'),
            post.scheduledAt ? post.scheduledAt.toISOString().split('T')[0] : '',
            post.scheduledAt ? post.scheduledAt.toTimeString().slice(0, 5) : '',
            post.pillar || '',
            post.status,
        ];
        lines.push(row.join(','));
    }

    return lines.join('\n');
}
