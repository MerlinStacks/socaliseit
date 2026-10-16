'use client';

import { SettingSection } from './customization-ui';
import type { PlatformSettings } from './customization-panel';
import type { MediaItem } from './platform-editor';

export function PeopleTagSettings({ settings, media, onSettingChange }: {
    settings: PlatformSettings;
    media: MediaItem[];
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
}) {
    const tags = settings.userTags || [];
    const fieldClass = 'min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-2 text-sm';
    return (
        <SettingSection title="Tag people" subtitle="Public Instagram usernames only. Choose the correct media and position; people are never tagged automatically." fullWidth>
            <div className="space-y-3">
                {tags.map((tag, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2">
                        <input aria-label={`Username for tag ${index + 1}`} className={fieldClass} placeholder="username" maxLength={30}
                            value={tag.username} onChange={e => onSettingChange('userTags', tags.map((t, i) => i === index ? { ...t, username: e.target.value.replace(/^@/, '') } : t))} />
                        <select aria-label={`Media for tag ${index + 1}`} className={fieldClass} value={tag.mediaIndex}
                            onChange={e => onSettingChange('userTags', tags.map((t, i) => i === index ? { ...t, mediaIndex: Number(e.target.value) } : t))}>
                            {media.map((item, i) => <option key={item.id} value={i}>Media {i + 1} ({item.type})</option>)}
                        </select>
                        {(['x', 'y'] as const).map(axis => (
                            <label key={axis} className="text-xs text-[var(--text-muted)]">
                                {axis === 'x' ? 'From left (0–1)' : 'From top (0–1)'}
                                <input type="number" min={0} max={1} step={0.01} className={`${fieldClass} w-full`} value={tag[axis]}
                                    onChange={e => onSettingChange('userTags', tags.map((t, i) => i === index ? { ...t, [axis]: Number(e.target.value) } : t))} />
                            </label>
                        ))}
                        <button type="button" className="text-left text-xs text-[var(--error)]" onClick={() => onSettingChange('userTags', tags.filter((_, i) => i !== index))}>Remove tag {index + 1}</button>
                    </div>
                ))}
                <button type="button" disabled={tags.length >= 20 || media.length === 0} className="text-sm text-[var(--accent-gold)] disabled:opacity-50"
                    onClick={() => onSettingChange('userTags', [...tags, { username: '', mediaIndex: 0, x: 0.5, y: 0.5 }])}>Add person tag</button>
            </div>
        </SettingSection>
    );
}
