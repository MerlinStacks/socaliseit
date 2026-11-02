'use client';

/**
 * What Seb made, not just what he said.
 *
 * A tool that found six images or wrote a draft should leave something the member can
 * act on, rather than a paragraph describing it. Each card is deliberately compact:
 * it sits inside a message bubble in a drawer roughly 420px wide.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarClock, Check, CircleAlert, FileText, Image as ImageIcon, Play } from 'lucide-react';
import type { MediaAttachment, PostArtifactItem, SebArtifact, SebToolTrace } from './types';
import { safeUrl } from './helpers';
import { MediaPreview, MediaPreviewGrid } from './media-preview';

function localUrl(value: string) {
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : safeUrl(value);
}

function changeLabel(change?: number | null) {
    if (change === null || change === undefined || !Number.isFinite(change)) return null;
    const rounded = Math.round(change);
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function ToolTrace({ tools }: { tools: SebToolTrace[] }) {
    if (!tools.length) return null;
    return <ol className="seb-tool-trace" aria-label="What Seb did">
        {tools.map((tool, index) => <li key={`${tool.name}-${index}`} className={tool.ok ? '' : 'seb-tool-failed'}>
            {tool.ok ? <Check size={13} /> : <CircleAlert size={13} />}{tool.label}
        </li>)}
    </ol>;
}

function MediaArtifact({ artifact }: { artifact: Extract<SebArtifact, { kind: 'media' }> }) {
    const [preview, setPreview] = useState<MediaAttachment | null>(null);
    return <section className="seb-artifact" aria-label={artifact.title}>
        <header><span className="seb-artifact-title"><ImageIcon size={14} />{artifact.title}</span><small>{artifact.items.length}</small></header>
        <MediaPreviewGrid attachments={artifact.items} onOpen={setPreview} />
        {preview && <MediaPreview attachment={preview} close={() => setPreview(null)} />}
    </section>;
}

function PostCard({ post }: { post: PostArtifactItem }) {
    const editUrl = localUrl(post.editUrl);
    return <article className="seb-post-card">
        <div className="seb-post-meta">
            <span className={`seb-post-status seb-post-${post.status}`}>{post.status}</span>
            <strong>{post.accountName}</strong>
            {post.postType !== 'feed' && <span className="seb-post-type">{post.postType}</span>}
        </div>
        {post.caption && <p className="seb-post-caption">{post.caption}</p>}
        {post.media.length > 0 && <div className="seb-post-media">
            {post.media.slice(0, 4).map((item, index) => item.type === 'video'
                ? <span key={index} className="seb-post-thumb seb-post-video"><Play size={13} /></span>
                : <img key={index} className="seb-post-thumb" src={localUrl(item.previewUrl)} alt="" loading="lazy" />)}
        </div>}
        <footer>
            {post.scheduledAt && <span className="seb-post-when"><CalendarClock size={13} />{post.scheduledAt}</span>}
            {editUrl && <Link className="seb-button seb-tiny" href={editUrl}><ArrowUpRight size={14} />Open in composer</Link>}
        </footer>
    </article>;
}

function PostsArtifact({ artifact }: { artifact: Extract<SebArtifact, { kind: 'posts' }> }) {
    return <section className="seb-artifact" aria-label={artifact.title}>
        <header><span className="seb-artifact-title"><FileText size={14} />{artifact.title}</span><small>{artifact.posts.length}</small></header>
        {/* A draft list is a thing to review, so the card is the list itself. */}
        {artifact.posts.map(post => <PostCard key={post.id} post={post} />)}
    </section>;
}

function MetricsArtifact({ artifact }: { artifact: Extract<SebArtifact, { kind: 'metrics' }> }) {
    return <section className="seb-artifact" aria-label={artifact.title}>
        <header><span className="seb-artifact-title"><CalendarClock size={14} />{artifact.title}</span></header>
        <table className="seb-metrics-table">
            <tbody>{artifact.rows.map(row => <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="seb-metrics-value">{row.value}</td>
                {changeLabel(row.change) && <td className={`seb-metrics-change ${Number(row.change) >= 0 ? 'is-up' : 'is-down'}`}>{changeLabel(row.change)}</td>}
            </tr>)}</tbody>
        </table>
        {artifact.note && <p className="seb-artifact-note">{artifact.note}</p>}
    </section>;
}

export function ArtifactList({ artifacts }: { artifacts?: SebArtifact[] }) {
    if (!artifacts?.length) return null;
    return <div className="seb-artifacts">{artifacts.map(artifact =>
        artifact.kind === 'media' ? <MediaArtifact key={artifact.id} artifact={artifact} />
            : artifact.kind === 'posts' ? <PostsArtifact key={artifact.id} artifact={artifact} />
                : <MetricsArtifact key={artifact.id} artifact={artifact} />)}
    </div>;
}
