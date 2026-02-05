import React from 'react';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { PlatformSettings } from './customization-panel';

interface InstagramSettingsProps {
    settings: PlatformSettings;
    onSettingChange: (key: keyof PlatformSettings, value: any) => void;
}

function SettingSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
            <div>
                <div className="font-medium text-sm text-white/90">{title}</div>
                {subtitle && <div className="text-xs text-white/50">{subtitle}</div>}
            </div>
            {children}
        </div>
    );
}

export function InstagramSettings({
    settings,
    onSettingChange,
}: InstagramSettingsProps) {
    return (
        <>
            {/* Show Reel in Feed */}
            <SettingSection title="Show Reel in Feed" subtitle="Also share to your main profile grid">
                <ToggleSwitch
                    enabled={settings.instagramShareToFeed !== false}
                    onChange={(value) => onSettingChange('instagramShareToFeed', value)}
                />
            </SettingSection>

            {/* Comments Enabled */}
            <SettingSection title="Comments enabled">
                <ToggleSwitch
                    enabled={settings.instagramComments !== false}
                    onChange={(value) => onSettingChange('instagramComments', value)}
                />
            </SettingSection>
        </>
    );
}
