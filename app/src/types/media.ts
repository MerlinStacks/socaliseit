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
}
