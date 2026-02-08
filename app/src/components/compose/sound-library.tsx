'use client';

/**
 * SoundLibrary - Audio track browser for video sound overlay
 * Why: Enables users to add custom audio to their videos for Reels/TikTok engagement
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Music,
    Upload,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Check,
    Search,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { showErrorToast } from '@/lib/api-error';

interface AudioTrack {
    id: string;
    name: string;
    url: string;
    duration: number;
    category?: string;
    isFeatured: boolean;
}

interface SoundLibraryProps {
    /** Currently selected track ID */
    selectedTrackId?: string;
    /** Callback when a track is selected */
    onSelect: (track: AudioTrack | null) => void;
    /** Callback to close the library */
    onClose?: () => void;
    /** CSS class name */
    className?: string;
}

type TabId = 'my-sounds' | 'featured' | 'none';

/**
 * SoundLibrary - Audio browser with My Sounds, Featured, and None tabs
 */
export function SoundLibrary({
    selectedTrackId,
    onSelect,
    onClose,
    className,
}: SoundLibraryProps) {
    const [activeTab, setActiveTab] = useState<TabId>('my-sounds');
    const [tracks, setTracks] = useState<AudioTrack[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Fetch tracks based on active tab
     */
    const fetchTracks = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (activeTab === 'featured') {
                params.set('featured', 'true');
            } else if (activeTab === 'my-sounds') {
                params.set('mine', 'true');
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch(`/api/audio/tracks?${params}`);
            if (res.ok) {
                const data = await res.json();
                setTracks(data.tracks || []);
            }
        } catch (error) {
            showErrorToast(error, 'Failed to fetch tracks');
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, searchQuery]);

    useEffect(() => {
        if (activeTab !== 'none') {
            fetchTracks();
        } else {
            setTracks([]);
        }
    }, [activeTab, fetchTracks]);

    /**
     * Handle audio playback
     */
    const togglePlay = (track: AudioTrack) => {
        if (playingId === track.id) {
            audioRef.current?.pause();
            setPlayingId(null);
        } else {
            if (audioRef.current) {
                audioRef.current.src = track.url;
                audioRef.current.play();
            }
            setPlayingId(track.id);
        }
    };

    /**
     * Handle file upload
     */
    const handleUpload = async (file: File) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

            const res = await fetch('/api/audio/tracks', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                await fetchTracks();
            }
        } catch (error) {
            showErrorToast(error, 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    /**
     * Handle track selection
     */
    const handleSelect = (track: AudioTrack) => {
        onSelect(track);
    };

    /**
     * Handle remove selection
     */
    const handleRemoveSound = () => {
        onSelect(null);
    };

    /**
     * Format duration as MM:SS
     */
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const tabs: { id: TabId; label: string }[] = [
        { id: 'my-sounds', label: 'My Sounds' },
        { id: 'featured', label: 'Featured' },
        { id: 'none', label: 'No Sound' },
    ];

    return (
        <div className={cn('flex flex-col bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]', className)}>
            {/* Hidden audio element for playback */}
            <audio
                ref={audioRef}
                onEnded={() => setPlayingId(null)}
            />

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                    <Music className="h-4 w-4" />
                    Sound Library
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                            activeTab === tab.id
                                ? 'border-b-2 border-[var(--accent-gold)] text-[var(--accent-gold)]'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'none' ? (
                /* No Sound Tab */
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <VolumeX className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                    <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">No sound overlay</p>
                    <p className="text-xs text-[var(--text-muted)]">Video will use original audio</p>
                    <button
                        onClick={handleRemoveSound}
                        className="mt-4 rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-gold-hover)]"
                    >
                        Remove Sound
                    </button>
                </div>
            ) : (
                <>
                    {/* Search & Upload */}
                    <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="Search sounds..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-9 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                        </div>
                        {activeTab === 'my-sounds' && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-gold)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-gold-hover)] disabled:opacity-50"
                            >
                                <Upload className="h-4 w-4" />
                                {isUploading ? 'Uploading...' : 'Upload'}
                            </button>
                        )}
                    </div>

                    {/* Track List */}
                    <div className="max-h-[300px] overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-gold)] border-t-transparent" />
                            </div>
                        ) : tracks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Music className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                                <p className="text-sm text-[var(--text-muted)]">
                                    {activeTab === 'my-sounds'
                                        ? 'No sounds uploaded yet'
                                        : 'No featured sounds available'}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        className={cn(
                                            'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-tertiary)]',
                                            selectedTrackId === track.id && 'bg-[var(--accent-gold-light)]'
                                        )}
                                    >
                                        {/* Play Button */}
                                        <button
                                            onClick={() => togglePlay(track)}
                                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-gold)] hover:text-white"
                                        >
                                            {playingId === track.id ? (
                                                <Pause className="h-4 w-4" />
                                            ) : (
                                                <Play className="h-4 w-4 ml-0.5" />
                                            )}
                                        </button>

                                        {/* Track Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                                {track.name}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                                <span>{formatDuration(track.duration)}</span>
                                                {track.category && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="capitalize">{track.category}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Select Button */}
                                        <button
                                            onClick={() => handleSelect(track)}
                                            className={cn(
                                                'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                                                selectedTrackId === track.id
                                                    ? 'bg-[var(--accent-gold)] text-white'
                                                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]'
                                            )}
                                        >
                                            <Check className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
