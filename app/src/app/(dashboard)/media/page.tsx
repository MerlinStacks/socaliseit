/**
 * Media Library page
 * Upload, organize, and search media files
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Upload, Search, Grid3x3, List,
    X, Image, Trash2, FolderPlus,
    Folder, Plus, Loader2
} from 'lucide-react';
import { MediaItem, MediaFolder } from '@/types/media';
import { UploadModal } from '@/components/media/upload-modal';
import { EditMediaModal } from '@/components/media/edit-media-modal';
import { MediaCard, MediaRow } from '@/components/media/media-list';
import { SkeletonMediaGrid } from '@/components/ui/skeleton';

export default function MediaPage() {
    const [view, setView] = useState<'grid' | 'list'>('grid');
    const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [folders, setFolders] = useState<MediaFolder[]>([]);
    const [unfiledCount, setUnfiledCount] = useState(0);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Modals state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
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

            const res = await fetch(`/api/media?${params}`);
            if (!res.ok) throw new Error('Failed to fetch media');
            const data = await res.json();
            setMedia(data.media);
        } catch (err) {
            console.error(err);
            setError('Failed to load media');
        }
    }, [selectedFolderId, searchQuery]);

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
        } catch (err) {
            console.error(err);
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
            console.error(err);
            setError('Failed to delete media');
        }
    };

    /**
     * Create new folder
     */
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;

        try {
            const res = await fetch('/api/media/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newFolderName.trim() }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create folder');
            }
            setNewFolderName('');
            setShowCreateFolder(false);
            await fetchFolders();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to create folder');
        }
    };

    const filteredMedia = media.filter(
        (m) =>
            m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="flex h-screen">
            {/* Folder Sidebar */}
            <aside className="hidden w-64 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4 md:block">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold text-[var(--text-secondary)]">Folders</h2>
                    <button
                        onClick={() => setShowCreateFolder(true)}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        title="New Folder"
                    >
                        <FolderPlus className="h-4 w-4" />
                    </button>
                </div>

                {/* Create folder input */}
                {showCreateFolder && (
                    <div className="mb-3 flex gap-2">
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                            placeholder="Folder name..."
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-gold)]"
                            autoFocus
                        />
                        <button
                            onClick={handleCreateFolder}
                            className="rounded-lg bg-[var(--accent-gold)] p-1.5 text-white"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}
                            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                <nav className="space-y-1">
                    {/* All Media */}
                    <button
                        onClick={() => setSelectedFolderId(null)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${selectedFolderId === null
                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                            }`}
                    >
                        <Image className="h-4 w-4" />
                        <span className="flex-1 text-left">All Media</span>
                        <span className="text-xs opacity-60">{media.length}</span>
                    </button>

                    {/* Unfiled */}
                    <button
                        onClick={() => setSelectedFolderId('root')}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${selectedFolderId === 'root'
                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                            }`}
                    >
                        <Folder className="h-4 w-4" />
                        <span className="flex-1 text-left">Unfiled</span>
                        <span className="text-xs opacity-60">{unfiledCount}</span>
                    </button>

                    {/* Folder list */}
                    {folders.map((folder) => (
                        <button
                            key={folder.id}
                            onClick={() => setSelectedFolderId(folder.id)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${selectedFolderId === folder.id
                                ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                }`}
                        >
                            <Folder className="h-4 w-4" style={{ color: folder.color }} />
                            <span className="flex-1 truncate text-left">{folder.name}</span>
                            <span className="text-xs opacity-60">{folder.mediaCount}</span>
                        </button>
                    ))}
                </nav>
            </aside>

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
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-4">
                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="Search media..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-10 w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Selection actions */}
                        {selectedMedia.length > 0 && (
                            <div className="mr-4 flex items-center gap-2">
                                <span className="text-sm text-[var(--text-secondary)]">
                                    {selectedMedia.length} selected
                                </span>
                                <button
                                    onClick={handleDelete}
                                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-[var(--text-muted)] hover:border-[var(--error)] hover:text-[var(--error)]"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setSelectedMedia([])}
                                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                    Clear
                                </button>
                            </div>
                        )}

                        {/* View toggle */}
                        <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                            <button
                                onClick={() => setView('grid')}
                                className={`rounded-md p-2 ${view === 'grid' ? 'bg-[var(--bg-secondary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                            >
                                <Grid3x3 className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setView('list')}
                                className={`rounded-md p-2 ${view === 'list' ? 'bg-[var(--bg-secondary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                            >
                                <List className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

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
                            {filteredMedia.map((item) => (
                                <MediaCard
                                    key={item.id}
                                    media={item}
                                    selected={selectedMedia.includes(item.id)}
                                    onSelect={() => toggleSelect(item.id)}
                                    onEdit={() => setEditingMedia(item)}
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
                                        <th className="p-4">Folder</th>
                                        <th className="p-4">Date</th>
                                        <th className="p-4"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMedia.map((item) => (
                                        <MediaRow
                                            key={item.id}
                                            media={item}
                                            selected={selectedMedia.includes(item.id)}
                                            onSelect={() => toggleSelect(item.id)}
                                            onEdit={() => setEditingMedia(item)}
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
