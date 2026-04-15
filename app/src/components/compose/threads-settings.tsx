/**
 * Threads-specific settings for customization panel
 *
 * Why: Threads API v25 added topic_tag and quote_post_id parameters.
 * - topic_tag: 1-50 chars, no periods or ampersands
 * - quote_post_id: numeric Threads media ID for quoting another post
 */

'use client';

import { SettingSection } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

interface ThreadsSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
}

/** Strips characters disallowed by Threads (periods and ampersands) */
function sanitizeTopicTag(value: string): string {
    return value.replace(/[.&]/g, '');
}

/**
 * Threads-specific settings section
 */
export function ThreadsSettings({
    settings,
    onSettingChange,
}: ThreadsSettingsProps) {
    const tag = settings.threadsTopicTag || '';
    const isOverLimit = tag.length > 50;

    return (
        <>
            {/* Topic Tag */}
            <SettingSection
                title="Topic tag"
                subtitle="Add a topic to help people discover your post"
            >
                <input
                    type="text"
                    value={tag}
                    onChange={(e) => {
                        const sanitized = sanitizeTopicTag(e.target.value);
                        onSettingChange('threadsTopicTag', sanitized || undefined);
                    }}
                    placeholder="e.g. Photography"
                    maxLength={50}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
                <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-[var(--text-muted)]">
                        No periods or ampersands
                    </p>
                    <p className={`text-xs ${isOverLimit ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>
                        {tag.length}/50
                    </p>
                </div>
            </SettingSection>

            {/* Quote Post */}
            <SettingSection
                title="Quote post"
                subtitle="Quote another Threads post with your commentary"
            >
                <input
                    type="text"
                    value={settings.threadsQuotePostId || ''}
                    onChange={(e) => {
                        // Why (BUG-FIX): Strip non-numeric characters — Threads API requires numeric IDs
                        const numeric = e.target.value.replace(/[^0-9]/g, '');
                        onSettingChange('threadsQuotePostId', numeric || undefined);
                    }}
                    placeholder="Threads post ID (numeric)"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Paste the numeric post ID from the Threads post you want to quote
                </p>
            </SettingSection>
        </>
    );
}
