/** Resolve catalogue previews only when both the track and artist match. */
export async function findSoundPreview(name: string, artist: string, country: string): Promise<string> {
    if (!name || !artist || /^(unknown|various|original sound)$/i.test(artist)) return '';

    try {
        const params = new URLSearchParams({
            term: `${name} ${artist}`,
            country: /^[A-Z]{2}$/.test(country) ? country : 'AU',
            entity: 'song',
            limit: '10',
        });
        const response = await fetch(`https://itunes.apple.com/search?${params}`, {
            next: { revalidate: 21600 },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return '';
        const data = await response.json() as {
            results?: Array<{ trackName?: string; artistName?: string; previewUrl?: string }>;
        };
        const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const match = data.results?.find(track =>
            normalize(track.trackName || '') === normalize(name)
            && normalize(track.artistName || '') === normalize(artist)
            && track.previewUrl?.startsWith('https://')
        );
        return match?.previewUrl || '';
    } catch {
        // A catalogue outage must not prevent the trends page from loading.
        return '';
    }
}
