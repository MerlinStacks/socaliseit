import type { Discussion, Workspace } from './types';

export function formatDate(value?: string | null) {
    if (!value || Number.isNaN(new Date(value).getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** Only explicit web URLs are eligible for evidence links. */
export function safeUrl(value: string): string | undefined {
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
    } catch { return undefined; }
}

export async function sebRequest<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}). Please retry.`);
    if (data === null) throw new Error('Seb returned an unreadable response. Please retry.');
    return data as T;
}

export function cleanSebMessage(content: string): string {
    try {
        const parsed: unknown = JSON.parse(content);
        if (typeof parsed === 'string' && parsed !== content) return cleanSebMessage(parsed);
        if (parsed && typeof parsed === 'object') {
            for (const key of ['message', 'response', 'content']) {
                const value = (parsed as Record<string, unknown>)[key];
                if (typeof value === 'string') return cleanSebMessage(value);
            }
        }
    } catch { /* Normal plain-text response. */ }
    return content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/<[^>]+>/g, '')
        .replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').trim();
}

export function workspaceDiscussions(data?: Workspace): Discussion[] {
    if (!data) return [];
    return [
        ...data.recommendations.map(item => ({ id: `recommendation:${item.id}`, title: item.title,
            prompt: `Discuss this Seb recommendation (${item.id}). Title: ${item.title}. Advice: ${item.advice}. Rationale: ${item.rationale || 'Not recorded'}.` })),
        ...data.experiments.map(item => ({ id: `experiment:${item.id}`, title: item.title,
            prompt: `Discuss this Seb experiment (${item.id}). Title: ${item.title}. Hypothesis: ${item.hypothesis}. Metric: ${item.metric}.` })),
        ...[...data.history, ...(data.latest && !data.history.some(r => r.id === data.latest?.id) ? [data.latest] : [])].map(item => ({
            id: `report:${item.id}`, title: item.title, prompt: `Discuss this Seb report (${item.id}). Title: ${item.title}. Summary: ${item.summary || 'No summary recorded'}.`,
        })),
    ];
}
