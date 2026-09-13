'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { PlatformIcon } from '@/components/compose/platform-icons';
import type { Platform } from '@/lib/platform-config';

/** Compact media preview with a persistent platform badge, including for text-only posts. */
export function UpcomingPostThumbnail({ thumbnailUrl, platform }: {
    thumbnailUrl: string | null;
    platform: string | null;
}) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const platformName = platform?.toLowerCase() || 'manual';

    return (
        <div className="relative h-14 w-14 shrink-0">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-secondary)] ring-1 ring-inset ring-[var(--border)]">
                {thumbnailUrl && thumbnailUrl !== failedUrl ? (
                    // Uploaded media URLs are dynamic; avoid routing them through the image optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailedUrl(thumbnailUrl)} />
                ) : (
                    <FileText aria-hidden="true" className="h-5 w-5 text-[var(--text-muted)]" />
                )}
            </div>
            <span role="img" aria-label={platformName === 'manual' ? 'Manual post' : platformName} title={platformName === 'manual' ? 'Manual post' : platformName}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-primary)] shadow-sm ring-2 ring-[var(--bg-tertiary)]">
                <PlatformIcon platform={platformName as Platform} size={14} />
            </span>
        </div>
    );
}
