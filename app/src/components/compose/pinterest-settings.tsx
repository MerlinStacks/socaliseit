/**
 * Pinterest-specific settings for customization panel
 */

'use client';

import { SettingSection } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

interface PinterestBoard {
    id: string;
    name: string;
    description?: string;
    privacy: 'PUBLIC' | 'SECRET' | 'PROTECTED';
    pinCount?: number;
}

interface PinterestSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
    boards: PinterestBoard[];
    loadingBoards: boolean;
}

/**
 * Pinterest-specific settings section
 * Why: Pinterest requires pin title, link, and board selection
 */
export function PinterestSettings({
    settings,
    onSettingChange,
    boards,
    loadingBoards,
}: PinterestSettingsProps) {
    return (
        <>
            {/* Pin Title */}
            <SettingSection title="Pin title">
                <input
                    type="text"
                    value={settings.pinTitle || ''}
                    onChange={(e) => onSettingChange('pinTitle', e.target.value)}
                    placeholder="Enter pin title..."
                    maxLength={100}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {(settings.pinTitle || '').length} / 100
                </div>
            </SettingSection>

            {/* Pin Link */}
            <SettingSection title="Pin link" subtitle="Destination URL when pin is clicked">
                <input
                    type="url"
                    value={settings.pinLink || ''}
                    onChange={(e) => onSettingChange('pinLink', e.target.value)}
                    placeholder="https://example.com/product"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
            </SettingSection>

            {/* Board Selector */}
            <SettingSection title="Select a board" subtitle="Required for Pinterest posts">
                <select
                    value={settings.boardId || ''}
                    onChange={(e) => onSettingChange('boardId', e.target.value || undefined)}
                    disabled={loadingBoards}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
                >
                    <option value="">
                        {loadingBoards ? 'Loading boards...' : 'Select a board'}
                    </option>
                    {boards.map((board) => (
                        <option key={board.id} value={board.id}>
                            {board.name} {board.pinCount !== undefined ? `(${board.pinCount} pins)` : ''}
                        </option>
                    ))}
                </select>
            </SettingSection>
        </>
    );
}
