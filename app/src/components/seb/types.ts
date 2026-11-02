/** Client projections of the documented /api/seb/workspace response. */
import type { SebArtifact, SebMediaItem as MediaAttachment, SebToolTrace } from '@/lib/ai/seb-artifacts';
export type { SebArtifact, SebMediaItem as MediaAttachment, SebPostItem as PostArtifactItem, SebToolTrace } from '@/lib/ai/seb-artifacts';
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
export type ChatItem = { role: 'user' | 'assistant'; content: string; attachments?: MediaAttachment[]; artifacts?: SebArtifact[]; tools?: SebToolTrace[] };
export type ChatSession = {
    id: string; title: string; updatedAt: string;
    messages: {
        role: 'USER' | 'ASSISTANT'; content: string;
        metadata?: { attachments?: MediaAttachment[]; artifacts?: SebArtifact[]; tools?: SebToolTrace[] } | null;
    }[];
};
export type Discussion = { id: string; title: string; prompt: string };
