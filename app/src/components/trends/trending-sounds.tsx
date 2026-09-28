'use client';

import { useRef, useState } from 'react';
import { ExternalLink, Music } from 'lucide-react';

import type { SoundItem, SoundTrendsData } from '@/types/trending-sounds';

function formatVolume(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
}

/** Native controls support seeking, volume, keyboard access and mobile playback. */
function SoundPreview({ sound, onPlay }: { sound: SoundItem; onPlay: (audio: HTMLAudioElement) => void }) {
    const [failed, setFailed] = useState(false);

    return (
        <div className="mt-3">
            {sound.previewUrl && !failed ? (
                <>
                    <audio
                        className="h-9 w-full"
                        controls
                        preload="none"
                        src={sound.previewUrl}
                        aria-label={`Preview ${sound.name} by ${sound.artist}`}
                        onPlay={event => onPlay(event.currentTarget)}
                        onError={() => setFailed(true)}
                    />
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                        {sound.previewSource === 'apple' ? 'Song preview · Apple Music (social edits may differ)' : 'Sound preview'}
                    </p>
                </>
            ) : (
                <p role="status" className="text-xs text-[var(--text-muted)]">
                    {failed ? 'Preview could not be played.' : 'Preview unavailable.'}
                </p>
            )}
            <a
                href={`https://www.tiktok.com/search?q=${encodeURIComponent(`${sound.name} ${sound.artist}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-pink-400 hover:underline"
                aria-label={`Find ${sound.name} on TikTok`}
            >
                Find on TikTok <ExternalLink className="h-3 w-3" />
            </a>
        </div>
    );
}

export function TrendingSounds({ data, region }: { data?: SoundTrendsData; region: string }) {
    const container = useRef<HTMLDivElement>(null);
    // Old cached API responses have no provenance; never render those as trends.
    const available = data?.status === 'available' && data.region === region
        && data.source && data.lastUpdated && Number.isFinite(Date.parse(data.lastUpdated))
        && data.periodDays && data.sounds.length > 0;
    const sounds = available ? data.sounds : [];

    // Keep only one preview playing, including while another preview is buffering.
    const handlePlay = (current: HTMLAudioElement) => {
        container.current?.querySelectorAll('audio').forEach(audio => {
            if (audio !== current) audio.pause();
        });
    };

    return (
        <div ref={container} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
                <Music className="h-4 w-4 text-pink-400" />
                <h2 className="text-sm font-semibold">Trending Sounds</h2>
            </div>
            <div className="mb-3 text-xs text-[var(--text-muted)]">
                <p>Source: {available ? data.source : 'No verified feed connected'} · Region: {region}</p>
                <p>
                    Last updated: {available ? (
                        <time dateTime={data.lastUpdated!}>{data.lastUpdated!.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</time>
                    ) : 'Not available'}
                    {available && ` · Ranking window: ${data.periodDays} days`}
                </p>
            </div>
            {!available && (
                <div className="card p-4">
                    <p role="status" className="text-sm font-medium">Current sound trends unavailable</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        We don’t have verified current sound rankings for this region. Check TikTok Creative Center and select your region there.
                    </p>
                    <a
                        href="https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-pink-400 hover:underline"
                    >
                        Open TikTok Creative Center <ExternalLink className="h-3 w-3" />
                    </a>
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {sounds.map(sound => (
                    <div key={sound.id} className="card min-w-0 p-4 hover:border-pink-500/30 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10">
                                <Music className="h-5 w-5 text-pink-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{sound.name}</p>
                                <p className="text-[10px] text-[var(--text-muted)] truncate">{sound.artist}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xs font-semibold">{sound.usageCount === null ? 'Usage unavailable' : `${formatVolume(sound.usageCount)} videos`}</p>
                                <span className={`text-[10px] font-medium ${sound.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {sound.trend === 'rising' ? '↑ Rising' : sound.trend === 'stable' ? '→ Stable' : sound.trend === 'declining' ? '↓ Declining' : 'Trend unknown'}
                                </span>
                            </div>
                        </div>
                        <SoundPreview key={`${sound.id}:${sound.previewUrl}`} sound={sound} onPlay={handlePlay} />
                    </div>
                ))}
            </div>
        </div>
    );
}
