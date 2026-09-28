/** Trend provenance is separate from the provider of an audio preview. */
export interface SoundItem {
    id: string;
    name: string;
    artist: string;
    usageCount: number | null;
    trend: 'rising' | 'stable' | 'declining' | 'unknown';
    previewUrl?: string;
    previewSource?: string;
}

export interface SoundTrendsData {
    sounds: SoundItem[];
    status: 'available' | 'unavailable';
    source: string | null;
    region: string;
    lastUpdated: string | null;
    periodDays: number | null;
}
