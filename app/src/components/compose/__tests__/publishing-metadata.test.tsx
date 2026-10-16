import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PeopleTagSettings } from '../people-tag-settings';
import { SubtitleSettings } from '../subtitle-settings';
import type { PlatformSettings } from '../customization-panel';

function SettingsHarness({ people = false }: { people?: boolean }) {
    const [settings, setSettings] = useState<PlatformSettings>({ postType: 'feed', autoPublish: true });
    const onSettingChange = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => setSettings(previous => ({ ...previous, [key]: value }));
    return <>
        {people ? <PeopleTagSettings settings={settings} onSettingChange={onSettingChange} media={[{ id: 'image', url: '/image.jpg', type: 'image', size: 1 }]} />
            : <SubtitleSettings settings={settings} onSettingChange={onSettingChange} />}
        <output data-testid="settings">{JSON.stringify(settings)}</output>
    </>;
}

describe('explicit publishing metadata controls', () => {
    it('lets users add, edit, position and remove a person tag without generating usernames', () => {
        render(<SettingsHarness people />);
        fireEvent.click(screen.getByRole('button', { name: 'Add person tag' }));
        fireEvent.change(screen.getByLabelText('Username for tag 1'), { target: { value: '@person' } });
        fireEvent.change(screen.getByLabelText('From left (0–1)'), { target: { value: '0.25' } });
        expect(JSON.parse(screen.getByTestId('settings').textContent!).userTags).toEqual([{ username: 'person', mediaIndex: 0, x: 0.25, y: 0.5 }]);
        fireEvent.click(screen.getByRole('button', { name: 'Remove tag 1' }));
        expect(JSON.parse(screen.getByTestId('settings').textContent!).userTags).toEqual([]);
    });
    it('keeps subtitle dialogue as user-reviewed input and supports removing a track', () => {
        render(<SettingsHarness />);
        fireEvent.click(screen.getByRole('button', { name: 'Add subtitle track' }));
        const text = '1\n00:00:00,000 --> 00:00:01,000\nHello.';
        fireEvent.change(screen.getByLabelText('Timed subtitles 1'), { target: { value: text } });
        expect(JSON.parse(screen.getByTestId('settings').textContent!).subtitleTracks[0].text).toBe(text);
        fireEvent.click(screen.getByRole('button', { name: 'Remove subtitle track 1' }));
        expect(JSON.parse(screen.getByTestId('settings').textContent!).subtitleTracks).toEqual([]);
    });
});
