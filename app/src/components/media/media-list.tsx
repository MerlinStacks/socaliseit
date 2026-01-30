"use client"

import { Film, Image, Pencil, Folder } from "lucide-react"
import { MediaItem } from "@/types/media"

/* Helper functions */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
}

interface MediaCardProps {
    media: MediaItem
    selected: boolean
    onSelect: () => void
    onEdit: () => void
}

export function MediaCard({ media, selected, onSelect, onEdit }: MediaCardProps) {
    const Icon = media.type === "video" ? Film : Image

    return (
        <div
            className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all ${selected
                ? "border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]"
                : "border-transparent hover:border-[var(--border)]"
                }`}
            onClick={onSelect}
        >
            {/* Thumbnail */}
            <div className="aspect-square bg-[var(--bg-tertiary)] relative">
                {media.thumbnailUrl ? (
                    <img
                        src={media.thumbnailUrl}
                        alt={media.filename}
                        className="h-full w-full object-cover"
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
                <p className="truncate text-sm font-medium">{media.filename}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatSize(media.size)}</p>
            </div>
        </div>
    )
}

export function MediaRow({ media, selected, onSelect, onEdit }: MediaCardProps) {
    const Icon = media.type === "video" ? Film : Image

    return (
        <tr
            className={`cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 ${selected ? "bg-[var(--accent-gold-light)]" : "hover:bg-[var(--bg-tertiary)]"
                }`}
            onClick={onSelect}
        >
            <td className="p-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                        {media.thumbnailUrl ? (
                            <img src={media.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                        )}
                    </div>
                    <span className="font-medium">{media.filename}</span>
                </div>
            </td>
            <td className="p-4">
                <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-1 text-xs font-medium capitalize">
                    {media.type}
                </span>
            </td>
            <td className="p-4 text-sm text-[var(--text-secondary)]">{formatSize(media.size)}</td>
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
            <td className="p-4 text-sm text-[var(--text-muted)]">{formatDate(media.createdAt)}</td>
            <td className="p-4">
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    title="Edit"
                >
                    <Pencil className="h-4 w-4" />
                </button>
            </td>
        </tr>
    )
}
