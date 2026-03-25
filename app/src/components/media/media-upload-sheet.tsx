/**
 * Mobile Upload Bottom Sheet
 * Full-screen bottom sheet for uploading media on mobile PWA.
 *
 * Why: The desktop Dialog-based UploadModal is hard to use on small screens.
 * This component provides a native-feeling upload experience with camera
 * capture, tap-to-browse, and a library tab in a MobileBottomSheet.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Camera, Upload, FolderOpen, X, Film, Image as ImageIcon,
    Loader2, Check, Search, ChevronLeft,
} from 'lucide-react';
import { MobileBottomSheet } from '@/components/mobile/mobile-bottom-sheet';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/hooks/use-haptic';
import { toast } from '@/components/ui/toast';
import { formatFileSize } from '@/lib/formatters';
import { showErrorToast } from '@/lib/api-error';
import { MediaFolder } from '@/types/media';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

/** Media item returned from upload API */
export interface UploadedMedia {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    size: number;
    filename: string;
    /** Why: Needed by validation to check platform min/max pixel requirements */
    width?: number;
    height?: number;
    /** Duration in seconds (videos only) */
    duration?: number;
    /** Async transcode status: null = not needed, 'pending' | 'processing' | 'completed' | 'failed' */
    transcodeStatus?: string | null;
}

/** Library item shape from GET /api/media */
interface LibraryMedia {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string | null;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    size: number;
    dimensions: { width: number; height: number } | null;
    duration: number | null;
    transcodeStatus?: string | null;
}

interface MediaUploadSheetProps {
    open: boolean;
    onClose: () => void;
    folders: MediaFolder[];
    defaultFolderId: string | null;
    /** Called after uploads complete with the array of uploaded media items */
    onUpload: (uploadedMedia: UploadedMedia[]) => Promise<void>;
}

type TabType = 'upload' | 'library';

// ============================================================================
// Component
// ============================================================================

/**
 * Full-screen mobile bottom sheet for uploading or selecting media.
 * Why: Replaces the desktop Dialog-based UploadModal on mobile for
 * a more natural touch-first experience with camera capture.
 */
export function MediaUploadSheet({
    open,
    onClose,
    folders,
    defaultFolderId,
    onUpload,
}: MediaUploadSheetProps) {
    const [activeTab, setActiveTab] = useState<TabType>('upload');
    const [files, setFiles] = useState<File[]>([]);
    const [folderId, setFolderId] = useState(defaultFolderId || '');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Library state
    const [libraryMedia, setLibraryMedia] = useState<LibraryMedia[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [librarySearch, setLibrarySearch] = useState('');
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Reset state on close
    useEffect(() => {
        if (!open) {
            setFiles([]);
            setSelectedLibraryIds(new Set());
            setLibrarySearch('');
            setActiveTab('upload');
            setUploadProgress(0);
        }
    }, [open]);

    // ============================================================================
    // Library
    // ============================================================================

    const fetchLibraryMedia = useCallback(async () => {
        setLibraryLoading(true);
        try {
            const params = new URLSearchParams();
            if (librarySearch) params.set('search', librarySearch);
            params.set('limit', '50');

            const response = await fetch(`/api/media?${params}`);
            if (!response.ok) throw new Error('Failed to fetch media');

            const data = await response.json();
            setLibraryMedia(data.media || []);
        } catch (error) {
            showErrorToast(error, 'Error fetching library media');
        } finally {
            setLibraryLoading(false);
        }
    }, [librarySearch]);

    useEffect(() => {
        if (open && activeTab === 'library') {
            const timer = setTimeout(fetchLibraryMedia, 300);
            return () => clearTimeout(timer);
        }
    }, [open, activeTab, fetchLibraryMedia]);

    /** Toggle library item selection */
    const toggleLibrarySelection = (id: string) => {
        triggerHaptic('light');
        setSelectedLibraryIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ============================================================================
    // File Handling
    // ============================================================================

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selected = Array.from(e.target.files);
            setFiles(prev => [...prev, ...selected]);
            triggerHaptic('light');
        }
        // Reset input so the same file can be selected again
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        triggerHaptic('light');
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    // ============================================================================
    // Upload
    // ============================================================================

    /** Upload a single file via XHR for progress tracking */
    const uploadFileWithProgress = (
        file: File,
        fileIndex: number,
        totalFiles: number,
    ): Promise<UploadedMedia | null> => {
        return new Promise(resolve => {
            const formData = new FormData();
            formData.append('file', file);
            if (folderId) formData.append('folderId', folderId);

            const xhr = new XMLHttpRequest();

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const fileProgress = event.loaded / event.total;
                    const overall = ((fileIndex + fileProgress) / totalFiles) * 100;
                    setUploadProgress(Math.round(overall));
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        resolve({
                            id: data.id, url: data.url,
                            thumbnailUrl: data.thumbnailUrl, type: data.type,
                            mimeType: data.mimeType, size: data.size,
                            filename: data.filename,
                            width: data.dimensions?.width,
                            height: data.dimensions?.height,
                            duration: data.duration,
                            transcodeStatus: data.transcodeStatus ?? null,
                        });
                    } catch {
                        toast('error', `Upload failed: ${file.name}`, 'Invalid response');
                        resolve(null);
                    }
                } else {
                    toast('error', `Upload failed: ${file.name}`, `Error (${xhr.status})`);
                    resolve(null);
                }
            };

            xhr.onerror = () => {
                toast('error', `Upload failed: ${file.name}`, 'Network error');
                resolve(null);
            };

            xhr.open('POST', '/api/media');
            xhr.send(formData);
        });
    };

    /** Handle submit — combine library selections + new uploads */
    const handleSubmit = async () => {
        triggerHaptic('medium');
        const allMedia: UploadedMedia[] = [];

        // Add selected library items
        for (const id of selectedLibraryIds) {
            const item = libraryMedia.find(m => m.id === id);
            if (item) {
                allMedia.push({
                    id: item.id, url: item.url,
                    thumbnailUrl: item.thumbnailUrl || undefined,
                    type: item.type, mimeType: item.mimeType,
                    size: item.size, filename: item.filename,
                    width: item.dimensions?.width,
                    height: item.dimensions?.height,
                    duration: item.duration ?? undefined,
                    transcodeStatus: item.transcodeStatus ?? null,
                });
            }
        }

        // Upload new files
        if (files.length > 0) {
            setIsUploading(true);
            setUploadProgress(0);

            for (let i = 0; i < files.length; i++) {
                const result = await uploadFileWithProgress(files[i], i, files.length);
                if (result) allMedia.push(result);
            }
            setIsUploading(false);
        }

        if (allMedia.length > 0) {
            await onUpload(allMedia);
        }

        onClose();
    };

    const totalSelected = selectedLibraryIds.size + files.length;
    const canSubmit = totalSelected > 0 && !isUploading;

    // ============================================================================
    // Render
    // ============================================================================

    return (
        <MobileBottomSheet
            open={open}
            onClose={onClose}
            title="Add Media"
            snapPoints={[90]}
            initialSnap={0}
        >
            <div className="flex flex-col h-full">
                {/* Tab Navigation */}
                <div className="flex border-b border-[var(--border)] px-4">
                    <TabButton
                        active={activeTab === 'upload'}
                        onClick={() => setActiveTab('upload')}
                        icon={<Upload className="h-4 w-4" />}
                        label="Upload"
                        badge={files.length || undefined}
                    />
                    <TabButton
                        active={activeTab === 'library'}
                        onClick={() => setActiveTab('library')}
                        icon={<FolderOpen className="h-4 w-4" />}
                        label="Library"
                        badge={selectedLibraryIds.size || undefined}
                    />
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'upload' ? (
                        <UploadTabContent
                            files={files}
                            folderId={folderId}
                            folders={folders}
                            isUploading={isUploading}
                            uploadProgress={uploadProgress}
                            fileInputRef={fileInputRef}
                            cameraInputRef={cameraInputRef}
                            onFileSelect={handleFileSelect}
                            onRemoveFile={removeFile}
                            onFolderChange={setFolderId}
                        />
                    ) : (
                        <LibraryTabContent
                            media={libraryMedia}
                            loading={libraryLoading}
                            search={librarySearch}
                            selectedIds={selectedLibraryIds}
                            onSearchChange={setLibrarySearch}
                            onToggle={toggleLibrarySelection}
                            onSwitchToUpload={() => setActiveTab('upload')}
                        />
                    )}
                </div>

                {/* Submit Button */}
                <div className="border-t border-[var(--border)] p-4 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
                    <Button
                        className="w-full h-12 text-base"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Uploading... {uploadProgress}%
                            </>
                        ) : (
                            <>
                                <Check className="h-5 w-5 mr-2" />
                                Add{totalSelected > 0 ? ` (${totalSelected})` : ''}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </MobileBottomSheet>
    );
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Tab button for the upload/library switcher */
function TabButton({ active, onClick, icon, label, badge }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    badge?: number;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                active
                    ? 'border-b-2 border-[var(--accent-gold)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]',
            )}
        >
            {icon}
            {label}
            {badge !== undefined && badge > 0 && (
                <span className="rounded-full bg-[var(--accent-gold)] px-1.5 py-0.5 text-xs text-white">
                    {badge}
                </span>
            )}
        </button>
    );
}

// ============================================================================
// Upload Tab
// ============================================================================

interface UploadTabContentProps {
    files: File[];
    folderId: string;
    folders: MediaFolder[];
    isUploading: boolean;
    uploadProgress: number;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    cameraInputRef: React.RefObject<HTMLInputElement | null>;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveFile: (index: number) => void;
    onFolderChange: (id: string) => void;
}

/** Upload tab with camera capture + file browse buttons */
function UploadTabContent({
    files, folderId, folders, isUploading, uploadProgress,
    fileInputRef, cameraInputRef, onFileSelect, onRemoveFile, onFolderChange,
}: UploadTabContentProps) {
    return (
        <div className="p-4 space-y-4">
            {/* Action buttons — Camera + Browse */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] p-6 transition-colors active:bg-[var(--bg-secondary)]"
                >
                    <Camera className="h-8 w-8 text-[var(--accent-gold)]" />
                    <span className="text-sm font-medium">Take Photo</span>
                </button>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-tertiary)] p-6 transition-colors active:bg-[var(--bg-secondary)]"
                >
                    <Upload className="h-8 w-8 text-[var(--accent-gold)]" />
                    <span className="text-sm font-medium">Browse Files</span>
                </button>
            </div>

            <p className="text-center text-xs text-[var(--text-muted)]">
                JPEG, PNG, WebP, GIF, MP4 up to 50MB
            </p>

            {/* Hidden file inputs */}
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                onChange={onFileSelect}
                className="hidden"
            />
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
                onChange={onFileSelect}
                className="hidden"
            />

            {/* Selected files strip */}
            {files.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                        {files.length} file{files.length !== 1 ? 's' : ''} selected
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {files.map((file, i) => (
                            <FileChip key={i} file={file} onRemove={() => onRemoveFile(i)} />
                        ))}
                    </div>
                </div>
            )}

            {/* Folder selector */}
            <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                    Upload to folder
                </label>
                <select
                    value={folderId}
                    onChange={(e) => onFolderChange(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                >
                    <option value="">Unfiled (root)</option>
                    {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
            </div>

            {/* Upload Progress */}
            {isUploading && (
                <div>
                    <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
                        <span>Uploading...</span>
                        <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                        <div
                            className="h-full rounded-full bg-[var(--accent-gold)] transition-all"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

/** Compact file chip for the horizontal file strip */
function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
    const isVideo = file.type.startsWith('video/');
    return (
        <div className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2">
            {isVideo ? (
                <Film className="h-4 w-4 text-[var(--text-muted)]" />
            ) : (
                <ImageIcon className="h-4 w-4 text-[var(--text-muted)]" />
            )}
            <span className="max-w-[120px] truncate text-sm">{file.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{formatFileSize(file.size)}</span>
            <button onClick={onRemove} className="p-0.5 text-[var(--text-muted)]">
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

// ============================================================================
// Library Tab
// ============================================================================

interface LibraryTabContentProps {
    media: LibraryMedia[];
    loading: boolean;
    search: string;
    selectedIds: Set<string>;
    onSearchChange: (q: string) => void;
    onToggle: (id: string) => void;
    onSwitchToUpload: () => void;
}

/** Library tab with search and 3-column media grid */
function LibraryTabContent({
    media, loading, search, selectedIds,
    onSearchChange, onToggle, onSwitchToUpload,
}: LibraryTabContentProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Search */}
            <div className="p-4 pb-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search media..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 pt-2">
                {loading ? (
                    <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-gold)]" />
                    </div>
                ) : media.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FolderOpen className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-muted)]">
                            {search ? 'No media found' : 'No media in library'}
                        </p>
                        <Button variant="ghost" className="mt-2" onClick={onSwitchToUpload}>
                            Upload new media
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {media
                            .filter(m => m.type === 'image' || m.type === 'video')
                            .map(item => {
                                const isSelected = selectedIds.has(item.id);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onToggle(item.id)}
                                        className={cn(
                                            'relative aspect-square overflow-hidden rounded-lg border-2 transition-all active:scale-95',
                                            isSelected
                                                ? 'border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]'
                                                : 'border-transparent',
                                        )}
                                    >
                                        {item.type === 'video' && !item.thumbnailUrl ? (
                                            <div className="flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)]">
                                                <Film className="h-6 w-6 text-[var(--text-muted)]" />
                                            </div>
                                        ) : (
                                            <img
                                                src={item.thumbnailUrl || item.url}
                                                alt={item.filename}
                                                className="h-full w-full object-cover"
                                            />
                                        )}

                                        {/* Selection indicator */}
                                        <div className={cn(
                                            'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                                            isSelected
                                                ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]'
                                                : 'border-white/80 bg-white/40',
                                        )}>
                                            {isSelected && <Check className="h-3 w-3 text-white" />}
                                        </div>

                                        {/* Type badge */}
                                        <div className="absolute right-1 top-1 rounded bg-black/60 p-0.5">
                                            {item.type === 'video' ? (
                                                <Film className="h-3 w-3 text-white" />
                                            ) : (
                                                <ImageIcon className="h-3 w-3 text-white" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                    </div>
                )}
            </div>
        </div>
    );
}
