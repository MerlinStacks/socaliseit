/**
 * Media Library Folder Sidebar
 * Sidebar for navigating media folders.
 * Supports dropping media items onto folders to move them.
 */

'use client';

import React, { useState } from 'react';
import { Image, Folder, FolderPlus, Plus, X } from 'lucide-react';
import { MediaFolder } from '@/types/media';

interface MediaFolderSidebarProps {
    folders: MediaFolder[];
    unfiledCount: number;
    totalMediaCount: number;
    selectedFolderId: string | null;
    onFolderSelect: (folderId: string | null) => void;
    onCreateFolder: (name: string) => Promise<void>;
    /** Drag-drop handlers for moving media to folders */
    onMediaDrop?: (folderId: string | null, event: React.DragEvent) => void;
    onDragOver?: (folderId: string | null, event: React.DragEvent) => void;
    onDragLeave?: () => void;
    dropTargetFolderId?: string | null;
    isDragging?: boolean;
}

/**
 * Sidebar with folder navigation and create folder functionality.
 * Now supports drag-and-drop of media items onto folders.
 */
export function MediaFolderSidebar({
    folders,
    unfiledCount,
    totalMediaCount,
    selectedFolderId,
    onFolderSelect,
    onCreateFolder,
    onMediaDrop,
    onDragOver,
    onDragLeave,
    dropTargetFolderId,
    isDragging,
}: MediaFolderSidebarProps) {
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        await onCreateFolder(newFolderName.trim());
        setNewFolderName('');
        setShowCreateFolder(false);
    };

    // Common drop zone handlers
    const getDropZoneProps = (folderId: string | null) => {
        if (!onMediaDrop || !onDragOver || !onDragLeave) return {};

        return {
            onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                onDragOver(folderId, e);
            },
            onDragLeave: () => onDragLeave(),
            onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                onMediaDrop(folderId, e);
            },
        };
    };

    // Check if a folder is the current drop target
    const isDropTarget = (folderId: string | null) => {
        return isDragging && dropTargetFolderId === folderId;
    };

    return (
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

            {/* Drag hint when dragging */}
            {isDragging && (
                <div className="mb-3 rounded-lg bg-[var(--accent-gold)]/10 px-3 py-2 text-xs text-[var(--accent-gold)]">
                    Drop onto a folder to move
                </div>
            )}

            <nav className="space-y-1">
                {/* All Media - not a drop target (just a view) */}
                <button
                    onClick={() => onFolderSelect(null)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${selectedFolderId === null
                        ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                >
                    <Image className="h-4 w-4" />
                    <span className="flex-1 text-left">All Media</span>
                    <span className="text-xs opacity-60">{totalMediaCount}</span>
                </button>

                {/* Unfiled - can drop here to remove from folders */}
                <button
                    onClick={() => onFolderSelect('root')}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${selectedFolderId === 'root'
                        ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        } ${isDropTarget(null) ? 'ring-2 ring-[var(--accent-gold)] bg-[var(--accent-gold-light)]' : ''}`}
                    {...getDropZoneProps(null)}
                >
                    <Folder className="h-4 w-4" />
                    <span className="flex-1 text-left">Unfiled</span>
                    <span className="text-xs opacity-60">{unfiledCount}</span>
                </button>

                {/* Folder list - each is a drop target */}
                {folders.map((folder) => (
                    <button
                        key={folder.id}
                        onClick={() => onFolderSelect(folder.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${selectedFolderId === folder.id
                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                            } ${isDropTarget(folder.id) ? 'ring-2 ring-[var(--accent-gold)] bg-[var(--accent-gold-light)]' : ''}`}
                        {...getDropZoneProps(folder.id)}
                    >
                        <Folder className="h-4 w-4" style={{ color: folder.color }} />
                        <span className="flex-1 truncate text-left">{folder.name}</span>
                        <span className="text-xs opacity-60">{folder.mediaCount}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
}
