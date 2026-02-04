/**
 * YouTube-specific settings for customization panel
 */

'use client';

import { SettingSection, ToggleSwitch } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

interface YouTubePlaylist {
    id: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    itemCount?: number;
}

interface YouTubeSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
    playlists: YouTubePlaylist[];
    loadingPlaylists: boolean;
}

/**
 * YouTube-specific settings section
 * Why: YouTube has unique requirements (title, privacy, category, playlist, etc.)
 */
export function YouTubeSettings({
    settings,
    onSettingChange,
    playlists,
    loadingPlaylists,
}: YouTubeSettingsProps) {
    return (
        <>
            {/* Video Title (Required) */}
            <SettingSection title="Video title *" subtitle="Required for YouTube uploads">
                <input
                    type="text"
                    value={settings.videoTitle || ''}
                    onChange={(e) => onSettingChange('videoTitle', e.target.value)}
                    placeholder="Enter video title..."
                    maxLength={100}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {(settings.videoTitle || '').length} / 100
                </div>
            </SettingSection>

            {/* Privacy Setting */}
            <SettingSection title="Privacy">
                <select
                    value={settings.privacy || 'public'}
                    onChange={(e) => onSettingChange('privacy', e.target.value as 'public' | 'private' | 'unlisted')}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                </select>
            </SettingSection>

            {/* Comments Setting */}
            <SettingSection title="Post comments">
                <select
                    value={settings.commentsEnabled === false ? 'disabled' : 'enabled'}
                    onChange={(e) => onSettingChange('commentsEnabled', e.target.value === 'enabled')}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                </select>
            </SettingSection>

            {/* Category Selector */}
            <SettingSection title="Select category">
                <select
                    value={settings.category || ''}
                    onChange={(e) => onSettingChange('category', e.target.value || undefined)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                >
                    <option value="">Select category</option>
                    <option value="1">Film & Animation</option>
                    <option value="2">Autos & Vehicles</option>
                    <option value="10">Music</option>
                    <option value="15">Pets & Animals</option>
                    <option value="17">Sports</option>
                    <option value="19">Travel & Events</option>
                    <option value="20">Gaming</option>
                    <option value="22">People & Blogs</option>
                    <option value="23">Comedy</option>
                    <option value="24">Entertainment</option>
                    <option value="25">News & Politics</option>
                    <option value="26">Howto & Style</option>
                    <option value="27">Education</option>
                    <option value="28">Science & Technology</option>
                    <option value="29">Nonprofits & Activism</option>
                </select>
            </SettingSection>

            {/* Playlist Selector */}
            <SettingSection title="Select playlist">
                <select
                    value={settings.playlist || ''}
                    onChange={(e) => onSettingChange('playlist', e.target.value || undefined)}
                    disabled={loadingPlaylists}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
                >
                    <option value="">
                        {loadingPlaylists ? 'Loading playlists...' : 'No playlist'}
                    </option>
                    {playlists.map((playlist) => (
                        <option key={playlist.id} value={playlist.id}>
                            {playlist.title} {playlist.itemCount !== undefined ? `(${playlist.itemCount})` : ''}
                        </option>
                    ))}
                </select>
            </SettingSection>

            {/* Video Tags */}
            <SettingSection title="Tag your video" subtitle="Separate tags with commas">
                <input
                    type="text"
                    value={(settings.videoTags || []).join(', ')}
                    onChange={(e) => {
                        const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                        onSettingChange('videoTags', tags);
                    }}
                    placeholder="Tag 1, Tag 2, Tag 3..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
            </SettingSection>

            {/* Create First Like */}
            <SettingSection title="Create first like">
                <ToggleSwitch
                    enabled={settings.createFirstLike || false}
                    onChange={(value) => onSettingChange('createFirstLike', value)}
                />
            </SettingSection>

            {/* Embeddable */}
            <SettingSection title="Embeddable">
                <ToggleSwitch
                    enabled={settings.embeddable !== false}
                    onChange={(value) => onSettingChange('embeddable', value)}
                />
            </SettingSection>
        </>
    );
}
