'use client';

import { useState } from 'react';
import type { Experiment, Workspace } from './types';
import type { WorkspaceController } from './use-workspace';
import { Evidence } from './evidence';
import { formatDate } from './helpers';

type Props = { data: Workspace; controller: WorkspaceController; discuss: (id: string) => void };

export function Experiments({ data, controller, discuss }: Props) {
    const [showClosed, setShowClosed] = useState(false);
    const mutation = controller.experiment;
    const items = data.experiments.filter(item => showClosed || ['PLANNED', 'RUNNING'].includes(item.status));
    return (
        <section className="seb-action-group" aria-labelledby="seb-experiments-title">
            <div className="seb-section-heading">
                <div>
                    <h3 id="seb-experiments-title">Experiments</h3>
                    <p className="seb-muted">Workspace-wide tests with a recorded hypothesis and metric.</p>
                </div>
                <label className="seb-checkbox">
                    <input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)} />
                    Include finished
                </label>
            </div>
            {mutation.error && (
                <p className="seb-error" role="alert">
                    {mutation.error.message}
                    <button className="seb-button" disabled={mutation.isPending}
                        onClick={() => mutation.variables && mutation.mutate(mutation.variables)}>Retry update</button>
                </p>
            )}
            {!items.length && <p className="seb-card seb-empty">No {showClosed ? '' : 'active '}experiments recorded.</p>}
            <div className="seb-action-grid">
                {items.map(item => {
                    const next: Experiment['status'] = item.status === 'PLANNED' ? 'RUNNING' : item.status === 'RUNNING' ? 'COMPLETED' : 'PLANNED';
                    const saving = mutation.isPending && mutation.variables?.id === item.id;
                    return (
                        <article key={item.id} className="seb-card seb-action-card" aria-busy={saving}>
                            <div className="seb-tags"><span>{item.status}</span>{item.platform && <span>{item.platform}</span>}</div>
                            <h4>{item.title}</h4>
                            <p className="seb-advice">{item.hypothesis}</p>
                            <p className="seb-muted">Measure: {item.metric}</p>
                            <div className="seb-actions">
                                <button className="seb-button seb-primary" disabled={mutation.isPending}
                                    onClick={() => mutation.mutate({ id: item.id, status: next })}>
                                    {saving ? 'Saving…' : next === 'RUNNING' ? 'Start experiment' : next === 'COMPLETED' ? 'Mark done' : 'Reopen'}
                                </button>
                                <button className="seb-button" onClick={() => discuss(`experiment:${item.id}`)}>Discuss</button>
                                {['PLANNED', 'RUNNING'].includes(item.status) && (
                                    <button className="seb-button seb-quiet" disabled={mutation.isPending}
                                        onClick={() => mutation.mutate({ id: item.id, status: 'CANCELLED' })}>Cancel</button>
                                )}
                            </div>
                            <details className="seb-details">
                                <summary>Experiment details & results</summary>
                                <p>{item.hypothesis}</p>
                                <p>Start: {formatDate(item.startAt)} · End: {formatDate(item.endAt)}</p>
                                <h5>Baseline</h5><Evidence value={item.baseline} />
                                <h5>Result</h5><Evidence value={item.result} />
                            </details>
                        </article>
                    );
                })}
            </div>
            {(data.hasMore.experiments.active || data.hasMore.experiments.closed) && (
                <p className="seb-limit">Additional experiments exist. Showing up to 100 active and 50 most recently updated finished experiments.</p>
            )}
        </section>
    );
}
