export interface MediaFolder {
    id: string;
    name: string;
    color: string;
    mediaCount: number;
}

export interface MediaItem {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string | null;
    type: 'image' | 'video';
    mimeType: string;
    size: number;
    dimensions: { width: number; height: number } | null;
    duration: number | null;
    tags: string[];
    folder: { id: string; name: string; color: string } | null;
    createdAt: string;
    usageCount: number; // Number of posts this media has been used in
    // Duplicate grouping fields
    contentHash: string | null;
    sourceMediaId: string | null;
    variantCount: number; // Number of variants (resized copies) of this media
    isVariant: boolean;   // True if this is a resized copy of another media
}
