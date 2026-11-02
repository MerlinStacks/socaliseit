/** Client projections of the documented /api/seb/workspace response. */
export type Recommendation = {
    id: string; reportId: string | null; socialAccountId: string | null;
    title: string; advice: string; rationale: string | null; category: string;
    priority: string; status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'DISMISSED';
    platform: string | null; socialAccount: { id: string; name: string; username: string | null; platform?: string } | null;
    evidence: unknown; citations: unknown; confidence: number;
    impactBaseline: unknown; impactResult: unknown; impactCheckedAt: string | null;
    dueAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
};
export type Experiment = {
    id: string; reportId: string | null; title: string; hypothesis: string;
    platform: string | null; metric: string;
    status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
    startAt: string | null; endAt: string | null; baseline: unknown; result: unknown;
    createdAt: string; updatedAt: string;
};
export type Report = {
    id: string; title: string; summary: string | null;
    status: 'GENERATING' | 'COMPLETED' | 'FAILED'; trigger: string;
    overallScore: number | null; confidence: number | null; createdAt: string; updatedAt: string;
    dataStartDate?: string | null; dataEndDate?: string | null;
};
export type Workspace = {
    latest: Report | null;
    review: { id: string; status: 'QUEUED' | 'RUNNING' | 'FAILED' | 'COMPLETED'; stage: string | null; createdAt: string; updatedAt: string } | null;
    recommendations: Recommendation[]; experiments: Experiment[]; history: Report[];
    activity: { id: string; title: string; createdAt: string; actor: 'Seb' | 'You' | 'System'; detail: string }[];
    hasMore: { recommendations: { active: boolean; closed: boolean }; experiments: { active: boolean; closed: boolean }; history: boolean; activity: boolean };
};
export type MediaAttachment = {
    id: string; postId?: string; title: string; caption?: string; platform?: string | null;
    status?: string; type: 'image' | 'video' | 'audio'; mimeType: string; url: string; previewUrl: string;
    width?: number | null; height?: number | null; duration?: number | null; rationale: string;
    folder?: string | null; tags?: string[]; usedInPosts?: number;
};

/** Something Seb made or looked up, shown as a card instead of only as prose. */
export type SebArtifact =
    | { kind: 'media'; id: string; title: string; items: MediaAttachment[] }
    | { kind: 'posts'; id: string; title: string; posts: PostArtifactItem[]; write?: boolean }
    | { kind: 'metrics'; id: string; title: string; range: string; rows: { label: string; value: string; change?: number | null }[]; note?: string };

export type PostArtifactItem = {
    id: string; caption: string; status: string; platform: string | null; accountName: string;
    postType: string; scheduledAt: string | null; publishedAt: string | null; editUrl: string;
    media: { previewUrl: string; type: 'image' | 'video' | 'audio' }[];
};

/** Plain-language record of a tool Seb ran, so the member can see what he did. */
export type SebToolTrace = { name: string; label: string; ok: boolean };

export type ChatItem = { role: 'user' | 'assistant'; content: string; attachments?: MediaAttachment[]; artifacts?: SebArtifact[]; tools?: SebToolTrace[] };
export type ChatSession = {
    id: string; title: string; updatedAt: string;
    messages: {
        role: 'USER' | 'ASSISTANT'; content: string;
        metadata?: { attachments?: MediaAttachment[]; artifacts?: SebArtifact[]; tools?: SebToolTrace[] } | null;
    }[];
};
export type Discussion = { id: string; title: string; prompt: string };
