'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { formatDate } from './helpers';
import type { WorkspaceController } from './use-workspace';
import type { Workspace } from './types';

export function ReviewStrip({ controller }: { controller: WorkspaceController }) {
    const { query, generate } = controller;
    const review = query.data?.review;
    const busy = review?.status === 'QUEUED' || review?.status === 'RUNNING';
    const statusLabel = query.isPending ? 'Loading status' : !query.data ? 'Status unavailable' : review?.status || 'No review yet';
    const fallbackStage = query.isPending ? 'Checking Seb’s latest review…' : !query.data ? 'Reconnect to see the latest review status' : review?.status === 'COMPLETED' ? 'Your latest review is ready' : review?.status === 'FAILED' ? 'The latest review could not finish' : review ? 'Detailed stage not recorded' : 'Your next steps start with a review';
    return <section className="seb-review" aria-label="Review status">
        <div role="status" className="seb-review-copy">
            <span className={`seb-status ${busy ? 'seb-status-active' : ''}`}><span className="seb-status-dot" />{statusLabel}</span>
            <strong>{generate.isPending ? 'Requesting a review…' : review?.stage || fallbackStage}</strong>
            {review && <small>Requested {formatDate(review.createdAt)} · Updated {formatDate(review.updatedAt)}</small>}
            {busy && query.data?.latest && <small>Your last completed briefing stays available below.</small>}
            {review?.status === 'FAILED' && <small>This review did not complete. You can request a new review.</small>}
        </div>
        <button className="seb-button seb-primary" onClick={() => generate.mutate()} disabled={generate.isPending || busy || !query.data}>
            <RefreshCw size={16} className={busy || generate.isPending ? 'animate-spin' : ''} />
            {busy ? 'Review in progress' : review?.status === 'FAILED' ? 'Retry review' : 'Run review'}
        </button>
        {generate.error && <p className="seb-error" role="alert">{generate.error.message}</p>}
    </section>;
}

export function Briefing({ data, discuss }: { data: Workspace; discuss: (id: string) => void }) {
    const report = data.latest;
    return <section className="seb-card seb-briefing" aria-labelledby="seb-briefing-title">
        <div className="seb-section-heading"><span className="seb-eyebrow"><Sparkles size={15} /> Latest completed briefing</span>{report && <button className="seb-button" onClick={() => discuss(`report:${report.id}`)}>Discuss briefing</button>}</div>
        <h2 id="seb-briefing-title">{report?.title || 'A clearer direction for your socials'}</h2>
        <p className="seb-summary">{report?.summary || (report ? 'No summary was recorded for this briefing.' : 'Run your first review to get evidence-backed recommendations from your connected accounts and content.')}</p>
        {report && <div className="seb-briefing-meta"><span>Completed briefing · {formatDate(report.updatedAt)}</span><span>Data window: {formatDate(report.dataStartDate)} — {formatDate(report.dataEndDate)}</span></div>}
    </section>;
}

export function WorkspaceHistory({ data, controller, discuss }: { data: Workspace; controller: WorkspaceController; discuss: (id: string) => void }) {
    const deletion = controller.deleteReport;
    return <div className="seb-secondary-grid">
        <section className="seb-card" aria-labelledby="seb-history-title">
            <h2 id="seb-history-title">Report history</h2><p className="seb-muted">Review attempts, separate from your conversations.</p>
            {deletion.error && <p className="seb-error" role="alert">{deletion.error.message} <button className="seb-button" onClick={() => deletion.variables && deletion.mutate(deletion.variables)}>Retry</button></p>}
            {!data.history.length && <p className="seb-empty">No reviews recorded yet.</p>}
            <div className="seb-records">{data.history.map(report => <details key={report.id}>
                <summary><strong>{report.title}</strong><span className="seb-muted">{report.status === 'GENERATING' ? 'Review attempt' : report.status} · {formatDate(report.createdAt)}</span></summary>
                <p className="seb-summary">{report.summary || 'No summary recorded.'}</p>
                <p className="seb-muted">Updated {formatDate(report.updatedAt)} · {report.trigger}</p>
                <div className="seb-actions"><button className="seb-button" onClick={() => discuss(`report:${report.id}`)}>Discuss report</button><button className="seb-button seb-quiet" disabled={deletion.isPending || report.status === 'GENERATING'} onClick={() => deletion.mutate(report.id)}>{deletion.isPending && deletion.variables === report.id ? 'Deleting…' : 'Delete report'}</button></div>
            </details>)}</div>
            {data.hasMore.history && <p className="seb-limit">Showing the newest 20 reports. Older reports are outside this workspace window.</p>}
        </section>
        <section className="seb-card" aria-labelledby="seb-activity-title">
            <h2 id="seb-activity-title">Recorded milestones</h2><p className="seb-muted">Review events and record-derived milestones. This is not a complete audit log.</p>
            {!data.activity.length && <p className="seb-empty">No milestones recorded yet.</p>}
            <ol className="seb-timeline">{data.activity.map(item => <li key={item.id}><strong>{item.title}</strong><small>{item.actor || 'System'} · {formatDate(item.createdAt)}</small><p>{item.detail}</p></li>)}</ol>
            {data.hasMore.activity && <p className="seb-limit">Showing the newest 50 milestones from the available workspace records.</p>}
        </section>
    </div>;
}
