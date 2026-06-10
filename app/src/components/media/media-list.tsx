"use client"

import { Film, Image, Pencil, Folder, GripVertical, Download, Layers } from "lucide-react"
import { MediaItem } from "@/types/media"
import { formatFileSize, formatRelativeTime } from "@/lib/formatters"
import { HoverVideoPreview } from "./video-thumbnail"
import { LazyImage } from "@/components/ui/lazy-image"


interface MediaCardProps {
    media: MediaItem
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    /** Drag handlers for folder organization */
    onDragStart?: (event: React.DragEvent) => void
    onDragEnd?: () => void
    isDragging?: boolean
}

function handleDownload(url: string, filename: string, e: React.MouseEvent) {
    e.stopPropagation()
    fetch(url)
        .then(res => res.blob())
        .then(blob => {
            const a = document.createElement("a")
            a.href = URL.createObjectURL(blob)
            a.download = filename
            a.click()
            URL.revokeObjectURL(a.href)
        })
}

function getDisplayFilename(media: MediaItem) {
    return media.transcodedUrl ? media.filename.replace(/\.[^.]+$/, ".mp4") : media.filename
}

export function MediaCard({ media, selected, onSelect, onEdit, onDragStart, onDragEnd, isDragging }: MediaCardProps) {
    const Icon = media.type === "video" ? Film : Image
    const mediaUrl = media.transcodedUrl || media.url
    const displayFilename = getDisplayFilename(media)

    return (
        <div className="relative">
            {/* Stacked cards effect for items with variants */}
            {media.variantCount > 0 && (
                <>
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] opacity-60" />
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] opacity-80" />
                </>
            )}
            <div
                className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all ${selected
                    ? "border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]"
                    : "border-transparent hover:border-[var(--border)]"
                    } ${isDragging ? "opacity-50" : ""} ${media.variantCount > 0 ? "relative z-10" : ""}`}
                onClick={onSelect}
                draggable={!!onDragStart}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
            >
            {/* Drag handle indicator */}
            {onDragStart && (
                <div className="absolute left-1 top-1 z-10 rounded bg-black/40 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="h-3 w-3 text-white" />
                </div>
            )}
            {/* Thumbnail with lazy loading */}
            <div className="aspect-square bg-[var(--bg-tertiary)] relative">
                {media.type === "video" ? (
                    <HoverVideoPreview videoUrl={mediaUrl} posterUrl={media.thumbnailUrl} alt={displayFilename} />
                ) : media.thumbnailUrl ? (
                    <LazyImage
                        src={media.thumbnailUrl}
                        alt={displayFilename}
                        className="h-full w-full"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-400 to-pink-400">
                        <Icon className="h-8 w-8 text-white/80" />
                    </div>
                )}
                {media.type === "video" && media.duration && (
                    <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                        {Math.floor(media.duration / 60)}:{String(Math.floor(media.duration % 60)).padStart(2, "0")}
                    </div>
                )}
                {/* Usage count badge - shows how many posts use this media */}
                {media.usageCount > 0 && (
                    <div className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white shadow-sm">
                        {media.usageCount}
                    </div>
                )}
            </div>

            {/* Selection circle */}
            <div
                className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${selected
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]"
                    : "border-white/80 bg-white/40 opacity-0 group-hover:opacity-100"
                    }`}
            >
                {selected && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </div>

            {/* Actions */}
            <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                    onClick={(e) => handleDownload(mediaUrl, displayFilename, e)}
                    className="rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    title="Download"
                >
                    <Download className="h-3 w-3 text-white" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    title="Edit"
                >
                    <Pencil className="h-3 w-3 text-white" />
                </button>
                <div className="rounded bg-black/60 p-1">
                    <Icon className="h-3 w-3 text-white" />
                </div>
            </div>

            {/* Info */}
            <div className="bg-[var(--bg-secondary)] p-3">
                <p className="truncate text-sm font-medium">{displayFilename}</p>
                <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-muted)]">{formatFileSize(media.size)}</p>
                    {media.isVariant && (
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] uppercase">Resized</span>
                    )}
                </div>
            </div>

            {/* Variant count badge */}
            {media.variantCount > 0 && (
                <div className="absolute bottom-12 left-2 z-20 flex items-center gap-1 rounded-full bg-[var(--accent-gold)] px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                    <Layers className="h-3 w-3" />
                    {media.variantCount + 1}
                </div>
            )}
            </div>
        </div>
    )
}

export function MediaRow({ media, selected, onSelect, onEdit, onDragStart, onDragEnd, isDragging }: MediaCardProps) {
    const Icon = media.type === "video" ? Film : Image
    const mediaUrl = media.transcodedUrl || media.url
    const displayFilename = getDisplayFilename(media)

    return (
        <tr
            className={`cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 ${selected ? "bg-[var(--accent-gold-light)]" : "hover:bg-[var(--bg-tertiary)]"
                } ${isDragging ? "opacity-50" : ""}`}
            onClick={onSelect}
            draggable={!!onDragStart}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
        >
            <td className="p-4">
                <div className="flex items-center gap-3">
                    {onDragStart && (
                        <GripVertical className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)] cursor-grab" />
                    )}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                        {media.type === "video" ? (
                            <HoverVideoPreview videoUrl={mediaUrl} posterUrl={media.thumbnailUrl} alt={displayFilename} />
                        ) : media.thumbnailUrl ? (
                            <img src={media.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                        )}
                    </div>
                    <span className="font-medium">{displayFilename}</span>
                </div>
            </td>
            <td className="p-4">
                <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-1 text-xs font-medium capitalize">
                    {media.type}
                </span>
            </td>
            <td className="p-4 text-sm text-[var(--text-secondary)]">{formatFileSize(media.size)}</td>
            <td className="p-4">
                {media.usageCount > 0 ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                        {media.usageCount}
                    </span>
                ) : (
                    <span className="text-xs text-[var(--text-muted)]">—</span>
                )}
            </td>
            <td className="p-4">
                {media.folder ? (
                    <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                        style={{ backgroundColor: `${media.folder.color}20`, color: media.folder.color }}
                    >
                        <Folder className="h-3 w-3" />
                        {media.folder.name}
                    </span>
                ) : (
                    <span className="text-xs text-[var(--text-muted)]">Unfiled</span>
                )}
            </td>
            <td className="p-4 text-sm text-[var(--text-muted)]">{formatRelativeTime(media.createdAt)}</td>
            <td className="p-4">
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => handleDownload(mediaUrl, displayFilename, e)}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        title="Download"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                        title="Edit"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                </div>
            </td>
        </tr>
    )
}
