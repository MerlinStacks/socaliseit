/**
 * Product Tag Overlay
 * Allows users to visually place product tags on media (Instagram/Facebook style)
 * 
 * Interactivity:
 * - Click to add tag at x,y
 * - Drag to move existing tags
 * - Show tooltips with product names
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Tag as TagIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductTag } from './product-tagging';

interface ProductTagOverlayProps {
    imageUrl: string;
    tags: ProductTag[];
    onTagClick?: (tag: ProductTag) => void;
    onPositionChange?: (tagId: string, x: number, y: number) => void;
    onRemoveTag?: (tagId: string) => void;
    onAddPosition?: (x: number, y: number) => void;
    startTaggingMode?: boolean;
    className?: string;
}

export function ProductTagOverlay({
    imageUrl,
    tags,
    onTagClick,
    onPositionChange,
    onRemoveTag,
    onAddPosition,
    startTaggingMode = false,
    className,
}: ProductTagOverlayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Handle click on image to add tag
    const handleImageClick = (e: React.MouseEvent) => {
        if (!containerRef.current || !onAddPosition || !startTaggingMode) return;

        // Don't trigger if clicking on an existing tag
        if ((e.target as HTMLElement).closest('.product-tag-marker')) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        onAddPosition(x, y);
    };

    // Handle drag start
    const handleDragStart = (e: React.MouseEvent, tagId: string) => {
        if (!onPositionChange) return;
        e.stopPropagation();
        setDraggingId(tagId);
    };

    // Handle dragging
    useEffect(() => {
        if (!draggingId || !onPositionChange) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            let x = (e.clientX - rect.left) / rect.width;
            let y = (e.clientY - rect.top) / rect.height;

            // Clamp values
            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));

            onPositionChange(draggingId, x, y);
        };

        const handleMouseUp = () => {
            setDraggingId(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingId, onPositionChange]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative overflow-hidden rounded-lg bg-black select-none group",
                startTaggingMode && "cursor-crosshair",
                className
            )}
            onClick={handleImageClick}
        >
            <img
                src={imageUrl}
                alt="Product tagging preview"
                className="h-full w-full object-contain pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity"
            />

            {/* Tag Markers */}
            {tags.map((tag) => (
                <div
                    key={tag.id}
                    className={cn(
                        "product-tag-marker absolute flex flex-col items-center transform -translate-x-1/2 -translate-y-1/2 z-10 transition-transform",
                        draggingId === tag.id ? "scale-110 z-20" : "scale-100"
                    )}
                    style={{
                        left: `${(tag.positionX || 0.5) * 100}%`,
                        top: `${(tag.positionY || 0.5) * 100}%`,
                    }}
                    onMouseEnter={() => setHoveredId(tag.id)}
                    onMouseLeave={() => setHoveredId(null)}
                >
                    {/* Tooltip / Label */}
                    {(hoveredId === tag.id || draggingId === tag.id) && (
                        <div className="mb-2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-1">
                            {tag.product.name}
                            <span className="ml-1 text-white/70">${tag.product.price}</span>
                        </div>
                    )}

                    {/* Dot Marker */}
                    <button
                        className={cn(
                            "group/marker relative flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition-colors border border-white/20",
                            draggingId === tag.id
                                ? "bg-[var(--accent-gold)] cursor-grabbing"
                                : "bg-black/60 hover:bg-black/80 cursor-grab backdrop-blur-md"
                        )}
                        onMouseDown={(e) => handleDragStart(e, tag.id)}
                        onClick={(e) => {
                            e.stopPropagation();
                            onTagClick?.(tag);
                        }}
                    >
                        <TagIcon className="h-4 w-4 text-white" />

                        {/* Remove Button (visible on hover) */}
                        {onRemoveTag && (hoveredId === tag.id) && !draggingId && (
                            <div
                                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveTag(tag.id);
                                }}
                            >
                                <X className="h-3 w-3" />
                            </div>
                        )}
                    </button>

                    {/* Connector Line (visual flourish) */}
                    <div className="h-full w-px bg-white/20 absolute -z-10 top-full hidden" />
                </div>
            ))}

            {/* Instruction Overlay (when mode is active but no tags) */}
            {startTaggingMode && tags.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <div className="rounded-full bg-black/60 px-4 py-2 text-xs font-medium text-white backdrop-blur-md">
                        Tap anywhere to tag a product
                    </div>
                </div>
            )}
        </div>
    );
}
