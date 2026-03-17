/**
 * LinkedIn-specific settings for customization panel
 *
 * Why: LinkedIn supports PUBLIC and CONNECTIONS visibility for posts.
 * Previously hardcoded to PUBLIC — this gives users control.
 */

'use client';

import { SettingSection } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

interface LinkedInSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
}

/**
 * LinkedIn-specific settings section
 */
export function LinkedInSettings({
    settings,
    onSettingChange,
}: LinkedInSettingsProps) {
    return (
        <>
            {/* Visibility Setting */}
            <SettingSection
                title="Post visibility"
                subtitle="Who can see this post"
            >
                <select
                    value={settings.linkedinVisibility || 'PUBLIC'}
                    onChange={(e) => onSettingChange('linkedinVisibility', e.target.value as 'PUBLIC' | 'CONNECTIONS')}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                >
                    <option value="PUBLIC">Public — Anyone on or off LinkedIn</option>
                    <option value="CONNECTIONS">Connections only</option>
                </select>
            </SettingSection>
        </>
    );
}
