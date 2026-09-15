'use client';

import { useEffect, useRef } from 'react';
import { Play, X } from 'lucide-react';
import type { MediaAttachment } from './types';
import { safeUrl } from './helpers';

function mediaUrl(value: string) {
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : safeUrl(value);
}

export function MediaPreviewGrid({ attachments, onOpen }: { attachments: MediaAttachment[]; onOpen: (item: MediaAttachment) => void }) {
    return <div className="seb-media-grid">{attachments.map(item => <button key={item.id} className="seb-media-tile" onClick={() => onOpen(item)}>
        {mediaUrl(item.previewUrl) ? <img src={mediaUrl(item.previewUrl)} alt={item.title} loading="lazy" /> : <span>Preview unavailable</span>}
        <span>{item.type === 'video' && <Play size={14} />}{item.title}</span>
    </button>)}</div>;
}

export function MediaPreview({ attachment, close }: { attachment: MediaAttachment; close: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
    return <dialog ref={ref} className="seb-media-dialog" aria-labelledby="seb-preview-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
        <div className="seb-section-heading"><h2 id="seb-preview-title">{attachment.title}</h2><button className="seb-button" aria-label="Close preview" onClick={close}><X size={18} /></button></div>
        {attachment.type === 'video' ? <video src={mediaUrl(attachment.url)} poster={mediaUrl(attachment.previewUrl)} controls playsInline /> : <img src={mediaUrl(attachment.previewUrl)} alt={attachment.title} />}
        <p>{attachment.rationale}</p>{attachment.caption && <p className="seb-summary">{attachment.caption}</p>}
        {mediaUrl(attachment.url) && <a className="seb-button" href={mediaUrl(attachment.url)} target="_blank" rel="noopener noreferrer">Open original media</a>}
    </dialog>;
}
