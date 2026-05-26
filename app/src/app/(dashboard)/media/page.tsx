/**
 * Media Library page
 * Upload, organize, and search media files
 * 
 * Features:
 * - Mobile-optimized grid view with selection
 * - Drag-and-drop media to folders
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Image } from 'lucide-react';
import { MediaItem, MediaFolder } from '@/types/media';
import { UploadModal } from '@/components/media/upload-modal';
import { EditMediaModal } from '@/components/media/edit-media-modal';
import { MediaCard, MediaRow } from '@/components/media/media-list';
import { SkeletonMediaGrid } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { MediaMobile } from './media-mobile';
import { useMediaDragDrop } from '@/hooks/use-media-drag-drop';
import { MediaUploadSheet } from '@/components/media/media-upload-sheet';
import { MediaEditSheet } from '@/components/media/media-edit-sheet';

// Extracted components
import { MediaFolderSidebar } from './media-folder-sidebar';
import { MediaToolbar } from './media-toolbar';

export default function MediaPage() {
    const isMobile = useIsMobile();
    const [view, setView] = useState<'grid' | 'list'>('grid');
    const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
    const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [folders, setFolders] = useState<MediaFolder[]>([]);
    const [unfiledCount, setUnfiledCount] = useState(0);
    const [totalMediaCount, setTotalMediaCount] = useState(0);
    const [usageCounts, setUsageCounts] = useState({ used: 0, unused: 0 });
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [groupDuplicates, setGroupDuplicates] = useState(true);

    // Modals state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);

    /**
     * Fetch media from API
     */
    const fetchMedia = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (selectedFolderId === 'root') params.set('folderId', 'root');
            else if (selectedFolderId) params.set('folderId', selectedFolderId);
            if (searchQuery) params.set('search', searchQuery);
            if (typeFilter !== 'all') params.set('type', typeFilter);
            if (usageFilter !== 'all') params.set('usage', usageFilter);
            // Fetch all items — no pagination limit
            params.set('limit', '0');

            const res = await fetch(`/api/media?${params}`);
            if (!res.ok) throw new Error('Failed to fetch media');
            const data = await res.json();
            setMedia(data.media);
            setUsageCounts(data.usageCounts ?? { used: 0, unused: 0 });
        } catch (err) {
            setError('Failed to load media');
        }
    }, [selectedFolderId, searchQuery, typeFilter, usageFilter]);

    /**
     * Fetch folders from API
     */
    const fetchFolders = useCallback(async () => {
        try {
            const res = await fetch('/api/media/folders');
            if (!res.ok) throw new Error('Failed to fetch folders');
            const data = await res.json();
            setFolders(data.folders);
            setUnfiledCount(data.unfiledCount);
            setTotalMediaCount(data.totalMediaCount);
        } catch (err) {
            // Silent fail - folders are not critical
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            await Promise.all([fetchMedia(), fetchFolders()]);
            setIsLoading(false);
        };
        load();
    }, [fetchMedia, fetchFolders]);

    const toggleSelect = (id: string) => {
        setSelectedMedia((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    /**
     * Handle media deletion
     */
    const handleDelete = async () => {
        if (selectedMedia.length === 0) return;
        if (!confirm(`Delete ${selectedMedia.length} item(s)? This cannot be undone.`)) return;

        try {
            const res = await fetch('/api/media', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedMedia }),
            });
            if (!res.ok) throw new Error('Failed to delete');
            setSelectedMedia([]);
            await Promise.all([fetchMedia(), fetchFolders()]);
        } catch (err) {
            setError('Failed to delete media');
        }
    };

    /**
     * Create new folder
     */
    const handleCreateFolder = async (name: string) => {
        try {
            const res = await fetch('/api/media/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create folder');
            }
            await fetchFolders();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create folder');
        }
    };

    /**
     * Move media to folder via API
     */
    const handleMoveToFolder = useCallback(async (mediaId: string, folderId: string | null) => {
        try {
            const res = await fetch('/api/media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: mediaId, folderId }),
            });
            if (!res.ok) throw new Error('Failed to move media');
            // Refresh both media and folder counts
            await Promise.all([fetchMedia(), fetchFolders()]);
        } catch (err) {
            setError('Failed to move media to folder');
        }
    }, [fetchMedia, fetchFolders]);

    // Initialize drag-drop hook
    const { dragState, handlers: dragHandlers } = useMediaDragDrop({
        onMoveToFolder: handleMoveToFolder,
    });

    const filteredMedia = media.filter(
        (m) =>
            m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    /**
     * Group duplicates: when enabled, hide variant items (isVariant === true)
     * so only originals are shown. Originals display a stacked card effect
     * with a variant count badge.
     */
    const displayMedia = useMemo(() => {
        if (!groupDuplicates) return filteredMedia;
        return filteredMedia.filter((m) => !m.isVariant);
    }, [filteredMedia, groupDuplicates]);

    // Mobile layout
    if (isMobile) {
        return (
            <>
                <MediaMobile
                    media={filteredMedia}
                    folders={folders}
                    totalMediaCount={totalMediaCount}
                    selectedFolderId={selectedFolderId}
                    searchQuery={searchQuery}
                    isLoading={isLoading}
                    typeFilter={typeFilter}
                    onFolderSelect={setSelectedFolderId}
                    onSearchChange={setSearchQuery}
                    onTypeFilterChange={setTypeFilter}
                    onUpload={() => setShowUploadModal(true)}
                    onMediaSelect={(item) => setEditingMedia(item)}
                    onRefresh={async () => {
                        await Promise.all([fetchMedia(), fetchFolders()]);
                    }}
                />
                <MediaUploadSheet
                    open={showUploadModal}
                    onClose={() => setShowUploadModal(false)}
                    folders={folders}
                    defaultFolderId={selectedFolderId !== 'root' ? selectedFolderId : null}
                    onUpload={async () => {
                        await Promise.all([fetchMedia(), fetchFolders()]);
                    }}
                />
                {editingMedia && (
                    <MediaEditSheet
                        open={!!editingMedia}
                        onClose={() => setEditingMedia(null)}
                        media={editingMedia}
                        folders={folders}
                        onSave={async () => {
                            await Promise.all([fetchMedia(), fetchFolders()]);
                        }}
                    />
                )}
            </>
        );
    }

    // Desktop layout
    return (
        <div className="flex h-screen">
            {/* Folder Sidebar */}
            <MediaFolderSidebar
                folders={folders}
                unfiledCount={unfiledCount}
                totalMediaCount={totalMediaCount}
                selectedFolderId={selectedFolderId}
                onFolderSelect={setSelectedFolderId}
                onCreateFolder={handleCreateFolder}
                // Drag-drop props
                isDragging={dragState.isDragging}
                dropTargetFolderId={dragState.dropTargetFolderId}
                onDragOver={dragHandlers.onDragOver}
                onDragLeave={dragHandlers.onDragLeave}
                onMediaDrop={dragHandlers.onDrop}
            />

            {/* Main Content */}
            <div className="flex flex-1 flex-col">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                    <h1 className="text-2xl font-semibold">Media Library</h1>
                    <Button onClick={() => setShowUploadModal(true)}>
                        <Upload className="h-4 w-4" />
                        Upload
                    </Button>
                </header>

                {/* Toolbar */}
                <MediaToolbar
                    searchQuery={searchQuery}
                    view={view}
                    selectedCount={selectedMedia.length}
                    typeFilter={typeFilter}
                    usageFilter={usageFilter}
                    usageCounts={usageCounts}
                    onSearchChange={setSearchQuery}
                    onViewChange={setView}
                    onTypeFilterChange={setTypeFilter}
                    onUsageFilterChange={setUsageFilter}
                    onDelete={handleDelete}
                    onClearSelection={() => setSelectedMedia([])}
                    groupDuplicates={groupDuplicates}
                    onGroupDuplicatesChange={setGroupDuplicates}
                />

                {/* Error banner */}
                {error && (
                    <div className="mx-8 mt-4 flex items-center justify-between rounded-lg bg-red-500/10 px-4 py-3 text-red-500">
                        <span>{error}</span>
                        <button onClick={() => setError(null)}>
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {isLoading ? (
                        <SkeletonMediaGrid count={12} />
                    ) : filteredMedia.length === 0 ? (
                        <div className="flex h-64 flex-col items-center justify-center text-[var(--text-muted)]">
                            <Image className="mb-4 h-12 w-12 opacity-50" />
                            <p>No media found</p>
                            <Button className="mt-4" onClick={() => setShowUploadModal(true)}>
                                <Upload className="h-4 w-4" />
                                Upload your first file
                            </Button>
                        </div>
                    ) : view === 'grid' ? (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                            {displayMedia.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    media={item}
                                    selected={selectedMedia.includes(item.id)}
                                    onSelect={() => toggleSelect(item.id)}
                                    onEdit={() => setEditingMedia(item)}
                                    onDragStart={(e) => dragHandlers.onDragStart(item.id, e)}
                                    onDragEnd={dragHandlers.onDragEnd}
                                    isDragging={dragState.draggedMediaId === item.id}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="card overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[var(--border)] bg-[var(--bg-tertiary)] text-left text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                                        <th className="p-4">File</th>
                                        <th className="p-4">Type</th>
                                        <th className="p-4">Size</th>
                                        <th className="p-4">Uses</th>
                                        <th className="p-4">Folder</th>
                                        <th className="p-4">Date</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayMedia.map((item) => (
                                        <MediaRow
                                            key={item.id}
                                            media={item}
                                            selected={selectedMedia.includes(item.id)}
                                            onSelect={() => toggleSelect(item.id)}
                                            onEdit={() => setEditingMedia(item)}
                                            onDragStart={(e) => dragHandlers.onDragStart(item.id, e)}
                                            onDragEnd={dragHandlers.onDragEnd}
                                            isDragging={dragState.draggedMediaId === item.id}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Upload Modal */}
            <UploadModal
                open={showUploadModal}
                onOpenChange={setShowUploadModal}
                folders={folders}
                defaultFolderId={selectedFolderId !== 'root' ? selectedFolderId : null}
                onUpload={async () => {
                    await Promise.all([fetchMedia(), fetchFolders()]);
                }}
            />

            {/* Edit Media Modal */}
            {editingMedia && (
                <EditMediaModal
                    open={!!editingMedia}
                    onOpenChange={(open) => !open && setEditingMedia(null)}
                    media={editingMedia}
                    folders={folders}
                    onSave={async () => {
                        await Promise.all([fetchMedia(), fetchFolders()]);
                    }}
                />
            )}
        </div>
    );
}
