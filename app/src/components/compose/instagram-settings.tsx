/**
 * Instagram-specific settings for customization panel
 * 
 * Why: Instagram has unique publishing options like "Show Reel in Feed"
 * Note: Comments toggling is NOT supported by Instagram Graph API during container creation.
 *       Users must manage comment settings on the Instagram app after publishing.
 */

'use client';

import { SettingSection, ToggleSwitch } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

interface InstagramSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
}

/**
 * Instagram-specific settings section
 */
export function InstagramSettings({
    settings,
    onSettingChange,
}: InstagramSettingsProps) {
    return (
        <>
            {/* Show Reel in Feed - Controls whether Reels also appear on profile grid */}
            <SettingSection
                title="Show Reel in Feed"
                subtitle="Also share to your main profile grid"
            >
                <ToggleSwitch
                    enabled={settings.instagramShareToFeed !== false}
                    onChange={(value) => onSettingChange('instagramShareToFeed', value)}
                />
            </SettingSection>
        </>
    );
}

