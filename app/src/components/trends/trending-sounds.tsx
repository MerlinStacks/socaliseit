'use client';

import { useRef, useState } from 'react';
import { ExternalLink, Music } from 'lucide-react';

export interface SoundItem {
    id: string;
    name: string;
    artist: string;
    usageCount: number;
    trend: string;
    previewUrl?: string;
    previewSource?: string;
}

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

export function TrendingSounds({ sounds }: { sounds: SoundItem[] }) {
    const container = useRef<HTMLDivElement>(null);
    if (sounds.length === 0) return null;

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
                                <p className="text-xs font-semibold">{formatVolume(sound.usageCount)}</p>
                                <span className={`text-[10px] font-medium ${sound.trend === 'rising' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {sound.trend === 'rising' ? '↑ Rising' : '→ Stable'}
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
