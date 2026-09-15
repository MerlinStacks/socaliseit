import { ArrowRight, MessageCircle } from 'lucide-react';
import type { Recommendation } from './types';
import { Evidence } from './evidence';
import { formatDate } from './helpers';

type Props = {
    item: Recommendation;
    pending: boolean;
    saving: boolean;
    update: (status: Recommendation['status']) => void;
    discuss: () => void;
};

export function RecommendationCard({ item, pending, saving, update, discuss }: Props) {
    const next = item.status === 'NEW' ? 'IN_PROGRESS' : item.status === 'IN_PROGRESS' ? 'DONE' : 'NEW';
    return (
        <article className="seb-card seb-action-card" aria-busy={saving}>
            <div className="seb-tags">
                <span className={item.priority === 'HIGH' ? 'seb-tag-gold' : ''}>{item.priority} priority</span>
                <span>{item.socialAccount?.name || item.platform || 'Workspace-wide'}</span>
                <span>{item.status.replaceAll('_', ' ')}</span>
            </div>
            <h4>{item.title}</h4>
            <p className="seb-advice">{item.advice}</p>
            <div className="seb-actions">
                <button className="seb-button seb-primary" disabled={pending} onClick={() => update(next)}>
                    {saving ? 'Saving…' : next === 'IN_PROGRESS' ? 'Start action' : next === 'DONE' ? 'Mark done' : 'Reopen'}
                    <ArrowRight size={14} />
                </button>
                <button className="seb-button" onClick={discuss}><MessageCircle size={14} />Discuss</button>
                {['NEW', 'IN_PROGRESS'].includes(item.status) && (
                    <button className="seb-button seb-quiet" disabled={pending} onClick={() => update('DISMISSED')}>Dismiss</button>
                )}
            </div>
            <details className="seb-details">
                <summary>Why this matters & evidence</summary>
                <h5>Full recommendation</h5><p>{item.advice}</p>
                <h5>Rationale</h5><p>{item.rationale || 'No rationale recorded.'}</p>
                <p className="seb-muted">
                    {item.category.replaceAll('_', ' ')} · Updated {formatDate(item.updatedAt)}
                    {item.dueAt ? ` · Due ${formatDate(item.dueAt)}` : ''}
                </p>
                <h5>Evidence</h5><Evidence value={item.evidence} />
                <h5>Sources</h5><Evidence value={item.citations} />
                {item.impactResult != null && (
                    <><h5>Recorded result</h5><Evidence value={item.impactResult} /><p>Checked {formatDate(item.impactCheckedAt)}</p></>
                )}
            </details>
        </article>
    );
}
