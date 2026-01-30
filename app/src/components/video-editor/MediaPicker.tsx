'use client';

/**
 * Media Picker Component
 * Compact media browser for selecting clips to add to the timeline.
 *
 * Why separate from Media Library page: Editor needs a focused, compact
 * picker rather than full-featured library management.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Search, Film, Image, Loader2, Plus, X, Music, Link as LinkIcon } from 'lucide-react';
import { useVideoProject, Clip } from '@/hooks/useVideoProject';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string | null;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    duration: number | null;
}

interface MediaPickerProps {
    /** Filter to show only specific media types */
    filter?: 'all' | 'video' | 'image' | 'audio';
    /** Called when media is added to timeline */
    onMediaAdded?: (mediaId: string) => void;
}

const DEFAULT_IMAGE_DURATION = 3; // seconds
const FPS = 30;

/**
 * Converts video duration (seconds) to frames
 */
const durationToFrames = (seconds: number): number => Math.ceil(seconds * FPS);

export const MediaPicker: React.FC<MediaPickerProps> = ({
    filter = 'all',
    onMediaAdded,
}) => {
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [uploading, setUploading] = useState(false);
    const [showImportInput, setShowImportInput] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addClip = useVideoProject((state) => state.addClip);
    const addAudioClip = useVideoProject((state) => state.addAudioClip);
    const currentFrame = useVideoProject((state) => state.currentFrame);

    const fetchMedia = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (filter !== 'all') params.set('type', filter);
            params.set('limit', '50');

            const response = await fetch(`/api/media?${params}`);
            if (!response.ok) throw new Error('Failed to fetch media');

            const data = await response.json();
            setMedia(data.media || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load media');
        } finally {
            setLoading(false);
        }
    }, [search, filter]);

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    const handleImportUrl = async () => {
        if (!importUrl.trim()) return;

        setIsImporting(true);
        try {
            const res = await fetch('/api/media/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: importUrl }),
            });

            if (!res.ok) throw new Error('Import failed');

            const item = await res.json();

            // Add to timeline immediately if user wants? Or just add to library?
            // Existing logic for upload adds to list, assumes list refreshes or we push it.
            // setMedia should be updated or refetched.

            setMedia(prev => [item, ...prev]);
            setImportUrl('');
            setShowImportInput(false);

            // Optional: Auto-add to timeline? Let's just select it/show it.
        } catch (error) {
            console.error(error);
            alert('Failed to import audio from URL');
        } finally {
            setIsImporting(false);
        }
    };

    const handleUpload = async (files: FileList) => {
        if (files.length === 0) return;

        setUploading(true);
        setError(null);
        try {
            for (const file of Array.from(files)) {
                console.log('Uploading file:', {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                });

                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/media', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    // Extract detailed error from response body
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Upload error response:', {
                        status: response.status,
                        errorData,
                    });
                    const errorMessage = errorData.error || `Failed to upload ${file.name} (${response.status})`;
                    throw new Error(errorMessage);
                }
            }
            // Refresh media list
            await fetchMedia();
        } catch (err) {
            console.error('Upload error:', err);
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };


    const handleAddToTimeline = useCallback((item: MediaItem) => {
        // Calculate duration in frames
        const durationSeconds = item.type === 'video' && item.duration
            ? item.duration
            : DEFAULT_IMAGE_DURATION;

        const durationFrames = durationToFrames(durationSeconds);

        if (item.type === 'audio') {
            addAudioClip({
                mediaId: item.id,
                mediaUrl: item.url,
                name: item.filename,
                startFrame: currentFrame, // Start at current playhead
                durationFrames,
                trimStart: 0,
                volume: 1,
            });
        } else {
            const clipData: Omit<Clip, 'id' | 'startFrame'> = {
                mediaId: item.id,
                mediaUrl: item.url,
                thumbnailUrl: item.thumbnailUrl,
                type: item.type as 'video' | 'image',
                durationFrames,
                trimStart: 0,
                trimEnd: 0,
                sourceDurationFrames: durationFrames,
                volume: 1,
                name: item.filename,
            };

            addClip(clipData);
        }
        onMediaAdded?.(item.id);
    }, [addClip, addAudioClip, onMediaAdded, currentFrame]);

    const filteredMedia = media.filter(item => {
        if (filter === 'all') return true;
        return item.type === filter;
    });

    return (
        <div className="media-picker" style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <h3 style={titleStyle}>Media</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || isImporting}
                        style={uploadButtonStyle}
                        title="Upload media"
                    >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    </button>
                    <button
                        onClick={() => setShowImportInput(!showImportInput)}
                        disabled={uploading || isImporting}
                        style={{
                            ...uploadButtonStyle,
                            backgroundColor: showImportInput ? 'rgba(255,255,255,0.1)' : 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)'
                        }}
                        title="Import from URL"
                    >
                        <LinkIcon size={16} />
                    </button>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*"
                    multiple
                    onChange={(e) => e.target.files && handleUpload(e.target.files)}
                    style={{ display: 'none' }}
                />
            </div>

            {/* Import Input */}
            {showImportInput && (
                <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8 }}>
                    <input
                        type="url"
                        placeholder="Paste link..."
                        value={importUrl}
                        onChange={e => setImportUrl(e.target.value)}
                        style={{ ...searchInputStyle, flex: 1 }}
                        onKeyDown={e => e.key === 'Enter' && handleImportUrl()}
                    />
                    <button
                        onClick={handleImportUrl}
                        disabled={isImporting || !importUrl}
                        style={{ ...uploadButtonStyle, width: 'auto', padding: '0 12px' }}
                    >
                        {isImporting ? <Loader2 size={14} className="animate-spin" /> : 'Import'}
                    </button>
                </div>
            )}

            {/* Search */}
            <div style={searchContainerStyle}>
                <Search size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                    type="text"
                    placeholder="Search media..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={searchInputStyle}
                />
                {search && (
                    <button onClick={() => setSearch('')} style={clearButtonStyle}>
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Filter tabs */}
            <div style={filterTabsStyle}>
                {(['all', 'video', 'image', 'audio'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => {/* Parent controls filter */ }}
                        style={{
                            ...filterTabStyle,
                            backgroundColor: filter === f ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                            borderColor: filter === f ? '#6366f1' : 'rgba(255,255,255,0.1)',
                        }}
                    >
                        {f === 'video' && <Film size={12} />}
                        {f === 'image' && <Image size={12} />}
                        {f === 'audio' && <Music size={12} />}
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Media grid */}
            <div style={gridContainerStyle}>
                {loading ? (
                    <div style={emptyStateStyle}>
                        <Loader2 size={24} className="animate-spin" style={{ color: '#6366f1' }} />
                    </div>
                ) : error ? (
                    <div style={emptyStateStyle}>
                        <p style={{ color: '#ef4444', fontSize: 12 }}>{error}</p>
                    </div>
                ) : filteredMedia.length === 0 ? (
                    <div style={emptyStateStyle}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                            No media found
                        </p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={uploadPromptStyle}
                        >
                            <Upload size={14} />
                            Upload Media
                        </button>
                    </div>
                ) : (
                    <div style={gridStyle}>
                        {filteredMedia.map((item) => (
                            <MediaThumbnail
                                key={item.id}
                                item={item}
                                onAdd={() => handleAddToTimeline(item)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface MediaThumbnailProps {
    item: MediaItem;
    onAdd: () => void;
}

const MediaThumbnail: React.FC<MediaThumbnailProps> = ({ item, onAdd }) => {
    const [hovered, setHovered] = useState(false);
    const thumbnailSrc = item.thumbnailUrl || item.url;

    return (
        <div
            style={thumbnailContainerStyle}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onAdd}
            title={`Add "${item.filename}" to timeline`}
        >
            {/* Thumbnail image */}
            {item.type === 'audio' ? (
                <div style={videoPlaceholderStyle}>
                    <Music size={24} color="#a855f7" />
                </div>
            ) : item.type === 'image' || item.thumbnailUrl ? (
                <img
                    src={thumbnailSrc}
                    alt={item.filename}
                    style={thumbnailImageStyle}
                    draggable={false}
                />
            ) : (
                <div style={videoPlaceholderStyle}>
                    <Film size={20} />
                </div>
            )}

            {/* Type badge */}
            <div style={typeBadgeStyle}>
                {item.type === 'video' ? <Film size={10} /> : item.type === 'audio' ? <Music size={10} /> : <Image size={10} />}
            </div>

            {/* Duration badge (for videos) */}
            {item.type === 'video' && item.duration && (
                <div style={durationBadgeStyle}>
                    {formatDuration(item.duration)}
                </div>
            )}

            {/* Hover overlay */}
            {hovered && (
                <div style={hoverOverlayStyle}>
                    <Plus size={20} />
                </div>
            )}
        </div>
    );
};

// ============================================================================
// HELPERS
// ============================================================================

const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 12px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.9)',
};

const uploadButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: 6,
    color: '#6366f1',
    cursor: 'pointer',
};

const searchContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    margin: '8px 8px 0',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.06)',
};

const searchInputStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: 12,
};

const clearButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    padding: 2,
};

const filterTabsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    padding: '8px 8px 0',
};

const filterTabStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    cursor: 'pointer',
};

const gridContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
};

const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
};

const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    padding: 20,
};

const uploadPromptStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: 6,
    color: '#6366f1',
    fontSize: 12,
    cursor: 'pointer',
};

const thumbnailContainerStyle: React.CSSProperties = {
    position: 'relative',
    aspectRatio: '16/9',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    overflow: 'hidden',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.08)',
};

const thumbnailImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

const videoPlaceholderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    color: 'rgba(255,255,255,0.3)',
};

const typeBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 4,
    left: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    color: '#fff',
};

const durationBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 4,
    right: 4,
    padding: '2px 6px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 3,
    fontSize: 10,
    color: '#fff',
    fontFamily: 'monospace',
};

const hoverOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.4)',
    color: '#fff',
};
