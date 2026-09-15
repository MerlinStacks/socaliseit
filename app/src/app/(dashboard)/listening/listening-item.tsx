'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ListeningItem } from './listening-types';

export function safeListeningUrl(value: string | null) {
    if (!value) return undefined;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; }
    catch { return undefined; }
}

export function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
    const terms = [...new Set(keywords.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!terms.length) return <>{text}</>;
    const regex = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return <>{text.split(regex).map((part, index) => index % 2 ? <mark key={index} className="rounded bg-[var(--accent-gold-light)] text-[var(--text-primary)]">{part}</mark> : part)}</>;
}

export function MentionCard({ item, selected, canManage, busy, onSelect, onRead }: { item: ListeningItem; selected: boolean; canManage: boolean; busy: boolean; onSelect: () => void; onRead: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [mediaFailed, setMediaFailed] = useState(false);
    const media = safeListeningUrl(item.mediaUrl);
    const external = safeListeningUrl(item.externalUrl);
    return <article className={`card space-y-3 p-4 ${!item.isRead ? 'border-l-4 border-l-[var(--accent-gold)]' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
            {canManage && <input type="checkbox" aria-label={`Select mention by ${item.authorName || 'Unknown author'}`} checked={selected} disabled={busy} onChange={onSelect} />}
            <strong>{item.authorName || 'Unknown author'}</strong>
            <span className="text-[var(--text-muted)]">{item.platform.toLowerCase()} · {item.sourceType.replaceAll('_', ' ')} · {item.sentiment}</span>
            <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-xs">{item.isRead ? 'Read' : 'Unread'}</span>
            <time className="text-xs text-[var(--text-muted)]" dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm"><HighlightedText text={!expanded && item.content.length > 420 ? `${item.content.slice(0, 420)}…` : item.content} keywords={item.matchedKeywords} /></p>
        {item.content.length > 420 && <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show full text'}</Button>}
        {media && <details><summary className="cursor-pointer text-sm text-[var(--accent-gold)]">Media preview</summary>{mediaFailed ? <p className="text-sm">Preview unavailable. <a href={media} target="_blank" rel="noopener noreferrer">Open media</a></p> : /\.(mp4|webm|mov)(\?|$)/i.test(media) ? <video src={media} controls preload="none" className="mt-2 max-h-72 max-w-full" onError={() => setMediaFailed(true)} /> : <img src={media} alt={`Media attached to mention by ${item.authorName || 'unknown author'}`} loading="lazy" className="mt-2 max-h-72 max-w-full rounded object-contain" onError={() => setMediaFailed(true)} />}</details>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]"><span>Monitor: {item.monitor.name}</span><span>Matched: {item.matchedKeywords.join(', ') || '—'}</span>{external && <a className="text-[var(--accent-gold)]" href={external} target="_blank" rel="noopener noreferrer">Open source ↗</a>}{canManage && <Button variant="secondary" size="sm" disabled={busy} onClick={onRead}>Mark {item.isRead ? 'unread' : 'read'}</Button>}</div>
    </article>;
}
