/**
 * Media Mobile Component
 * Mobile-optimized media library with 2-column grid and bottom sheet actions
 * 
 * Why: Desktop media library with sidebar is hard to use on mobile;
 * this provides a touch-friendly grid with simplified navigation
 */

'use client';

import { useState, useRef } from 'react';
import { Search, Upload, FolderOpen, Image as ImageIcon, Video, Trash2, X, Plus, ChevronRight, Download } from 'lucide-react';
import { MobileCard } from '@/components/mobile/mobile-card';
import { MobileBottomSheet } from '@/components/mobile/mobile-bottom-sheet';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/hooks/use-haptic';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { MediaItem, MediaFolder } from '@/types/media';

interface MediaMobileProps {
    media: MediaItem[];
    folders: MediaFolder[];
    selectedFolderId: string | null;
    searchQuery: string;
    isLoading: boolean;
    onFolderSelect: (folderId: string | null) => void;
    onSearchChange: (query: string) => void;
    onUpload: () => void;
    onMediaSelect: (media: MediaItem) => void;
    onRefresh: () => Promise<void>;
}

export function MediaMobile({
    media,
    folders,
    selectedFolderId,
    searchQuery,
    isLoading,
    onFolderSelect,
    onSearchChange,
    onUpload,
    onMediaSelect,
    onRefresh,
}: MediaMobileProps) {
    const [showFolders, setShowFolders] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [isSelecting, setIsSelecting] = useState(false);

    // Pull to refresh
    const { containerRef, isRefreshing, pullProgress, pullDistance, canRefresh } = usePullToRefresh({
        onRefresh,
    });

    /**
     * Handle long press to enter selection mode
     */
    const handleLongPress = (id: string) => {
        triggerHaptic('medium');
        setIsSelecting(true);
        setSelectedItems([id]);
    };

    /**
     * Handle tap in selection mode
     */
    const handleTap = (item: MediaItem) => {
        if (isSelecting) {
            triggerHaptic('light');
            setSelectedItems(prev =>
                prev.includes(item.id)
                    ? prev.filter(x => x !== item.id)
                    : [...prev, item.id]
            );
        } else {
            onMediaSelect(item);
        }
    };

    /**
     * Cancel selection mode
     */
    const cancelSelection = () => {
        setIsSelecting(false);
        setSelectedItems([]);
    };

    /**
     * Get current folder name
     */
    const getCurrentFolderName = () => {
        if (selectedFolderId === null) return 'All Media';
        if (selectedFolderId === 'root') return 'Unfiled';
        const folder = folders.find(f => f.id === selectedFolderId);
        return folder?.name || 'Folder';
    };

    return (
        <div
            ref={containerRef}
            className="flex flex-col min-h-screen bg-[var(--bg-primary)]"
        >
            {/* Header */}
            <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-lg">
                <div className="flex items-center justify-between px-4 py-3">
                    {isSelecting ? (
                        <>
                            <button
                                onClick={cancelSelection}
                                className="text-[var(--accent-gold)] font-medium"
                            >
                                Cancel
                            </button>
                            <span className="font-medium">{selectedItems.length} selected</span>
                            <button
                                onClick={async () => {
                                    triggerHaptic('medium');
                                    if (!confirm(`Delete ${selectedItems.length} item(s)?`)) return;
                                    try {
                                        const res = await fetch('/api/media', {
                                            method: 'DELETE',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ids: selectedItems }),
                                        });
                                        if (!res.ok) throw new Error('Delete failed');
                                        cancelSelection();
                                        await onRefresh();
                                    } catch {
                                        alert('Failed to delete media. Please try again.');
                                    }
                                }}
                                className="text-red-500"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                        </>
                    ) : (
                        <>
                            <h1 className="text-lg font-semibold">Media</h1>
                            <button
                                onClick={() => {
                                    triggerHaptic('medium');
                                    onUpload();
                                }}
                                className="rounded-lg bg-gradient p-2"
                            >
                                <Upload className="h-5 w-5 text-white" />
                            </button>
                        </>
                    )}
                </div>

                {/* Search Bar */}
                {!isSelecting && (
                    <div className="px-4 pb-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="Search media..."
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                        </div>
                    </div>
                )}

                {/* Folder Selector */}
                {!isSelecting && (
                    <button
                        onClick={() => {
                            triggerHaptic('light');
                            setShowFolders(true);
                        }}
                        className="flex w-full items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-left"
                    >
                        <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-[var(--text-muted)]" />
                            <span className="text-sm font-medium">{getCurrentFolderName()}</span>
                            <span className="text-xs text-[var(--text-muted)]">
                                ({media.length})
                            </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
                {isLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="aspect-square animate-pulse rounded-xl bg-[var(--bg-secondary)]"
                            />
                        ))}
                    </div>
                ) : media.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <ImageIcon className="h-12 w-12 text-[var(--text-muted)] mb-3" />
                        <p className="text-[var(--text-muted)] mb-1">No media found</p>
                        <p className="text-sm text-[var(--text-muted)] mb-4">
                            Upload images and videos to get started
                        </p>
                        <Button onClick={onUpload}>
                            <Upload className="h-4 w-4" />
                            Upload
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {media.map((item) => (
                            <MediaGridItem
                                key={item.id}
                                item={item}
                                selected={selectedItems.includes(item.id)}
                                isSelecting={isSelecting}
                                onTap={() => handleTap(item)}
                                onLongPress={() => handleLongPress(item.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Folder Bottom Sheet */}
            <MobileBottomSheet
                open={showFolders}
                onClose={() => setShowFolders(false)}
                title="Select Folder"
                snapPoints={[50, 75]}
            >
                <div className="p-4 space-y-2">
                    {/* All Media */}
                    <FolderItem
                        name="All Media"
                        count={media.length}
                        selected={selectedFolderId === null}
                        onSelect={() => {
                            triggerHaptic('light');
                            onFolderSelect(null);
                            setShowFolders(false);
                        }}
                    />

                    {/* Unfiled */}
                    <FolderItem
                        name="Unfiled"
                        selected={selectedFolderId === 'root'}
                        onSelect={() => {
                            triggerHaptic('light');
                            onFolderSelect('root');
                            setShowFolders(false);
                        }}
                    />

                    {/* User Folders */}
                    {folders.map(folder => (
                        <FolderItem
                            key={folder.id}
                            name={folder.name}
                            count={folder.mediaCount}
                            color={folder.color}
                            selected={selectedFolderId === folder.id}
                            onSelect={() => {
                                triggerHaptic('light');
                                onFolderSelect(folder.id);
                                setShowFolders(false);
                            }}
                        />
                    ))}
                </div>
            </MobileBottomSheet>
        </div>
    );
}

// ============================================================================
// Media Grid Item
// ============================================================================
interface MediaGridItemProps {
    item: MediaItem;
    selected: boolean;
    isSelecting: boolean;
    onTap: () => void;
    onLongPress: () => void;
}

function MediaGridItem({ item, selected, isSelecting, onTap, onLongPress }: MediaGridItemProps) {
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleTouchStart = () => {
        longPressTimer.current = setTimeout(() => {
            onLongPress();
        }, 500);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
    };

    const isVideo = item.type.startsWith('video/');

    return (
        <button
            onClick={onTap}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className={cn(
                'relative aspect-square overflow-hidden rounded-xl bg-[var(--bg-secondary)] transition-transform active:scale-95',
                selected && 'ring-2 ring-[var(--accent-gold)]'
            )}
        >
            <Image
                src={item.url}
                alt={item.filename}
                fill
                className="object-cover"
            />

            {/* Video indicator */}
            {isVideo && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5">
                    <Video className="h-3 w-3 text-white" />
                </div>
            )}

            {/* Download button */}
            {!isSelecting && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        fetch(item.url)
                            .then(res => res.blob())
                            .then(blob => {
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = item.filename;
                                a.click();
                                URL.revokeObjectURL(a.href);
                            });
                    }}
                    className="absolute bottom-2 right-2 rounded-md bg-black/60 p-1.5 transition-opacity hover:bg-black/80"
                    title="Download"
                >
                    <Download className="h-3.5 w-3.5 text-white" />
                </button>
            )}

            {/* Selection checkbox */}
            {isSelecting && (
                <div className={cn(
                    'absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
                    selected
                        ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]'
                        : 'border-white bg-black/30'
                )}>
                    {selected && (
                        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
            )}
        </button>
    );
}

// ============================================================================
// Folder Item
// ============================================================================
interface FolderItemProps {
    name: string;
    count?: number;
    color?: string;
    selected: boolean;
    onSelect: () => void;
}

function FolderItem({ name, count, color, selected, onSelect }: FolderItemProps) {
    return (
        <button
            onClick={onSelect}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors',
                selected
                    ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                    : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
            )}
        >
            <FolderOpen className="h-5 w-5" style={color ? { color } : undefined} />
            <span className="flex-1 text-left font-medium">{name}</span>
            {count !== undefined && (
                <span className="text-sm opacity-60">{count}</span>
            )}
            {selected && (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            )}
        </button>
    );
}
