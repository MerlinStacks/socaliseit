/**
 * TikTok-specific settings for customization panel
 */

'use client';

import { SettingSection, ToggleSwitch } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

interface TikTokSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
}

/**
 * TikTok-specific settings section
 */
export function TikTokSettings({
    settings,
    onSettingChange,
}: TikTokSettingsProps) {
    return (
        <>
            {/* Promotional Content */}
            <SettingSection title="Promotional content" subtitle="Promoting your own business">
                <ToggleSwitch
                    enabled={settings.tiktokBrandOrganicToggle || false}
                    onChange={(value) => onSettingChange('tiktokBrandOrganicToggle', value)}
                />
            </SettingSection>

            {/* Paid Partnership */}
            <SettingSection title="Paid partnership" subtitle="Promoting a third-party brand">
                <ToggleSwitch
                    enabled={settings.tiktokBrandContentToggle || false}
                    onChange={(value) => onSettingChange('tiktokBrandContentToggle', value)}
                />
            </SettingSection>

            {/* AI Generated */}
            <SettingSection title="AI generated" subtitle="Content created with AI">
                <ToggleSwitch
                    enabled={settings.tiktokIsAigc || false}
                    onChange={(value) => onSettingChange('tiktokIsAigc', value)}
                />
            </SettingSection>

            {/* Comments Enabled */}
            <SettingSection title="Comments enabled">
                <ToggleSwitch
                    enabled={settings.tiktokCommentsEnabled !== false}
                    onChange={(value) => onSettingChange('tiktokCommentsEnabled', value)}
                />
            </SettingSection>

            {/* Duets Enabled */}
            <SettingSection title="Duets enabled">
                <ToggleSwitch
                    enabled={settings.tiktokDuetsEnabled !== false}
                    onChange={(value) => onSettingChange('tiktokDuetsEnabled', value)}
                />
            </SettingSection>

            {/* Stitches Enabled */}
            <SettingSection title="Stitches enabled">
                <ToggleSwitch
                    enabled={settings.tiktokStitchesEnabled !== false}
                    onChange={(value) => onSettingChange('tiktokStitchesEnabled', value)}
                />
            </SettingSection>
        </>
    );
}

// Re-export for easier imports
export default TikTokSettings;
