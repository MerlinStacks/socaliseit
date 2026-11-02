/** JSON-only projections shared by the agent and chat UI; no server or React dependencies. */
export type SebMediaItem = {
    id: string; postId?: string; title: string; caption?: string; platform?: string | null;
    status?: string; type: 'image' | 'video' | 'audio'; mimeType: string; url: string; previewUrl: string;
    width?: number | null; height?: number | null; duration?: number | null; rationale: string;
    folder?: string | null; tags?: string[]; usedInPosts?: number;
};

export type SebPostItem = {
    id: string; caption: string; status: string; platform: string | null; accountName: string;
    postType: string; scheduledAt: string | null; publishedAt: string | null; editUrl: string;
    media: { previewUrl: string; type: 'image' | 'video' | 'audio' }[];
};

export type SebArtifact =
    | { kind: 'media'; id: string; title: string; items: SebMediaItem[] }
    | { kind: 'posts'; id: string; title: string; posts: SebPostItem[]; write?: boolean }
    | { kind: 'metrics'; id: string; title: string; range: string; rows: { label: string; value: string; change?: number | null }[]; note?: string };

export type SebToolTrace = { name: string; label: string; ok: boolean };
