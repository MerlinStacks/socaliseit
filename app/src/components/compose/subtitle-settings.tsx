'use client';

import { SettingSection } from './customization-ui';
import type { PlatformSettings } from './customization-panel';

export function SubtitleSettings({ settings, onSettingChange }: {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
}) {
    const tracks = settings.subtitleTracks || [];
    const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm';
    return (
        <SettingSection title="Video subtitles" subtitle="Paste reviewed SRT or WebVTT with timestamps. Uploaded as YouTube closed captions, separate from the post description. Requires YouTube video-edit permissions." fullWidth>
            <div className="space-y-3">
                {tracks.map((track, index) => (
                    <div key={index} className="space-y-2">
                        <input aria-label={`Subtitle language ${index + 1}`} className={fieldClass} placeholder="Language code, e.g. en-AU" maxLength={35} value={track.language}
                            onChange={e => onSettingChange('subtitleTracks', tracks.map((t, i) => i === index ? { ...t, language: e.target.value } : t))} />
                        <input aria-label={`Subtitle name ${index + 1}`} className={fieldClass} placeholder="Track name" maxLength={150} value={track.name}
                            onChange={e => onSettingChange('subtitleTracks', tracks.map((t, i) => i === index ? { ...t, name: e.target.value } : t))} />
                        <textarea aria-label={`Timed subtitles ${index + 1}`} className={fieldClass} rows={5} maxLength={500000} placeholder={'1\n00:00:00,000 --> 00:00:02,000\nYour spoken words here.'} value={track.text}
                            onChange={e => onSettingChange('subtitleTracks', tracks.map((t, i) => i === index ? { ...t, text: e.target.value } : t))} />
                        <button type="button" className="text-xs text-[var(--error)]" onClick={() => onSettingChange('subtitleTracks', tracks.filter((_, i) => i !== index))}>Remove subtitle track {index + 1}</button>
                    </div>
                ))}
                <button type="button" disabled={tracks.length >= 5} className="text-sm text-[var(--accent-gold)] disabled:opacity-50"
                    onClick={() => onSettingChange('subtitleTracks', [...tracks, { language: 'en', name: 'English', text: '' }])}>Add subtitle track</button>
            </div>
        </SettingSection>
    );
}
