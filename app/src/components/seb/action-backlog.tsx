'use client';

import { useState } from 'react';
import type { Workspace } from './types';
import type { WorkspaceController } from './use-workspace';
import { RecommendationCard } from './recommendation-card';
import { Experiments } from './experiments';

type Props = { data: Workspace; controller: WorkspaceController; discuss: (id: string) => void };
const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function ActionBacklog({ data, controller, discuss }: Props) {
    const [account, setAccount] = useState('all');
    const [status, setStatus] = useState('active');
    const accounts = new Map(data.recommendations.flatMap(item =>
        item.socialAccount ? [[item.socialAccount.id, item.socialAccount.name] as const] : []));
    const recommendations = data.recommendations.filter(item =>
        (account === 'all' || (account === 'unassigned' ? !item.socialAccountId : item.socialAccountId === account)) &&
        (status === 'all' || (status === 'active' ? ['NEW', 'IN_PROGRESS'].includes(item.status) : item.status === status)));
    const groups = [
        {
            title: 'Top actions', subtitle: 'Prioritised next steps across your reports.',
            items: recommendations.filter(r => r.status === 'NEW')
                .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)),
        },
        {
            title: 'In progress', subtitle: 'Keep momentum on the work you have started.',
            items: recommendations.filter(r => r.status === 'IN_PROGRESS'),
        },
        {
            title: 'Completed & dismissed', subtitle: 'Reopen a recommendation whenever it becomes relevant again.',
            items: recommendations.filter(r => ['DONE', 'DISMISSED'].includes(r.status)),
        },
    ];
    const mutation = controller.recommendation;

    return (
        <section className="seb-backlog" aria-labelledby="seb-actions-title">
            <div className="seb-section-heading">
                <div>
                    <span className="seb-eyebrow">Your workspace</span>
                    <h2 id="seb-actions-title">Recommendations</h2>
                    <p className="seb-muted">An actionable backlog across reports, including standalone advice.</p>
                </div>
                <span className="seb-count">
                    {data.recommendations.filter(r => ['NEW', 'IN_PROGRESS'].includes(r.status)).length} active
                    {data.hasMore.recommendations.active ? '+' : ''}
                </span>
            </div>
            <div className="seb-filters">
                <label>Account
                    <select value={account} onChange={event => setAccount(event.target.value)}>
                        <option value="all">All accounts</option>
                        <option value="unassigned">Workspace-wide / no account</option>
                        {Array.from(accounts, ([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                </label>
                <label>Status
                    <select value={status} onChange={event => setStatus(event.target.value)}>
                        <option value="active">Active recommendations</option>
                        <option value="all">All available statuses</option>
                        <option value="NEW">New</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="DONE">Completed</option>
                        <option value="DISMISSED">Dismissed</option>
                    </select>
                </label>
            </div>
            {mutation.error && (
                <p className="seb-error" role="alert">
                    {mutation.error.message}
                    <button className="seb-button" disabled={mutation.isPending}
                        onClick={() => mutation.variables && mutation.mutate(mutation.variables)}>Retry update</button>
                </p>
            )}
            {!recommendations.length && (
                <div className="seb-card seb-empty">
                    {data.recommendations.length ? 'No recommendations match these filters.' : 'No recommendations yet. Run a review to find your next steps.'}
                </div>
            )}
            {groups.filter(group => group.items.length).map(group => (
                <div key={group.title} className="seb-action-group">
                    <h3>{group.title} <span className="seb-muted">{group.items.length}</span></h3>
                    <p className="seb-muted">{group.subtitle}</p>
                    <div className="seb-action-grid">
                        {group.items.map(item => (
                            <RecommendationCard key={item.id} item={item}
                                pending={mutation.isPending}
                                saving={mutation.isPending && mutation.variables?.id === item.id}
                                update={status => mutation.mutate({ id: item.id, status })}
                                discuss={() => discuss(`recommendation:${item.id}`)} />
                        ))}
                    </div>
                </div>
            ))}
            {(data.hasMore.recommendations.active || data.hasMore.recommendations.closed) && (
                <p className="seb-limit">
                    Workspace shows up to 100 active and 50 most recently updated closed recommendations.
                    Additional {data.hasMore.recommendations.active ? 'active' : ''}
                    {data.hasMore.recommendations.active && data.hasMore.recommendations.closed ? ' and ' : ''}
                    {data.hasMore.recommendations.closed ? 'closed' : ''} recommendations exist; filters apply to this loaded window.
                </p>
            )}
            <Experiments data={data} controller={controller} discuss={discuss} />
        </section>
    );
}
