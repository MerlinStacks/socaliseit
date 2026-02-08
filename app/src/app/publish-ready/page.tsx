'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, Copy, Download, Loader2, AlertCircle, ExternalLink } from 'lucide-react';

interface PostData {
    id: string;
    caption: string;
    status: string;
    platforms: Array<{ platform: string; name: string }>;
    media: Array<{ id: string; url: string; type: string }>;
}

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

export default function PublishReadyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary, #0F0F12)' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-gold, #D4A574)' }} />
            </div>
        }>
            <PublishReadyContent />
        </Suspense>
    );
}

function PublishReadyContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const postId = searchParams.get('postId');

    const [post, setPost] = useState<PostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [captionCopied, setCaptionCopied] = useState(false);
    const [mediaStatuses, setMediaStatuses] = useState<Record<string, DownloadStatus>>({});
    const [autoTriggered, setAutoTriggered] = useState(false);

    // Fetch post data
    useEffect(() => {
        if (!postId) {
            setError('No post ID provided');
            setLoading(false);
            return;
        }

        fetch(`/api/posts/${postId}`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to load post');
                return res.json();
            })
            .then((data) => {
                setPost(data);
                // Initialize media statuses
                const statuses: Record<string, DownloadStatus> = {};
                (data.media || []).forEach((m: { id: string }) => {
                    statuses[m.id] = 'idle';
                });
                setMediaStatuses(statuses);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to fetch post:', err);
                setError('Could not load post. You may need to log in first.');
                setLoading(false);
            });
    }, [postId]);

    // Copy caption to clipboard
    const copyCaption = useCallback(async () => {
        if (!post?.caption) return;
        try {
            await navigator.clipboard.writeText(post.caption);
            setCaptionCopied(true);
            setTimeout(() => setCaptionCopied(false), 3000);
        } catch {
            // Fallback for browsers that block clipboard API
            const textarea = document.createElement('textarea');
            textarea.value = post.caption;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCaptionCopied(true);
            setTimeout(() => setCaptionCopied(false), 3000);
        }
    }, [post?.caption]);

    // Download a single media file
    const downloadMedia = useCallback(async (mediaId: string, url: string, index: number) => {
        setMediaStatuses((prev) => ({ ...prev, [mediaId]: 'downloading' }));
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const extension = blob.type.startsWith('video/') ? 'mp4' : 'jpg';
            const filename = `post-media-${index + 1}.${extension}`;

            // Create download link
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(objectUrl);

            setMediaStatuses((prev) => ({ ...prev, [mediaId]: 'done' }));
        } catch (err) {
            console.error(`Failed to download media ${mediaId}:`, err);
            setMediaStatuses((prev) => ({ ...prev, [mediaId]: 'error' }));
        }
    }, []);

    // Download all media files
    const downloadAllMedia = useCallback(async () => {
        if (!post?.media?.length) return;
        for (let i = 0; i < post.media.length; i++) {
            const m = post.media[i];
            await downloadMedia(m.id, m.url, i);
            // Small delay between downloads to avoid browser blocking
            if (i < post.media.length - 1) {
                await new Promise((r) => setTimeout(r, 500));
            }
        }
    }, [post?.media, downloadMedia]);

    // Auto-trigger copy + download on first load
    useEffect(() => {
        if (!post || autoTriggered) return;
        setAutoTriggered(true);

        // Auto-copy caption
        copyCaption();

        // Auto-download media
        if (post.media?.length > 0) {
            downloadAllMedia();
        }
    }, [post, autoTriggered, copyCaption, downloadAllMedia]);

    const mediaDownloaded = Object.values(mediaStatuses).filter((s) => s === 'done').length;
    const mediaTotal = post?.media?.length || 0;
    const allDone = captionCopied && mediaDownloaded === mediaTotal;
    const platformName = post?.platforms?.[0]?.platform || 'your platform';

    // Loading state
    if (loading) {
        return (
            <div className="publish-ready-container">
                <div className="publish-ready-card">
                    <Loader2 className="publish-ready-spinner" />
                    <h1>Preparing your post...</h1>
                    <p className="publish-ready-muted">Loading caption and media</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !post) {
        return (
            <div className="publish-ready-container">
                <div className="publish-ready-card">
                    <AlertCircle className="publish-ready-error-icon" />
                    <h1>Something went wrong</h1>
                    <p className="publish-ready-muted">{error || 'Post not found'}</p>
                    <button className="publish-ready-btn primary" onClick={() => router.push('/login')}>
                        Log in
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="publish-ready-container">
            <div className="publish-ready-card">
                {/* Header */}
                <div className="publish-ready-header">
                    <span className="publish-ready-emoji">📲</span>
                    <h1>{allDone ? 'Ready to post!' : 'Preparing your post...'}</h1>
                    <p className="publish-ready-muted">
                        {allDone
                            ? `Open ${platformName} and paste your caption`
                            : 'Copying caption and saving media...'
                        }
                    </p>
                </div>

                {/* Caption section */}
                <div className="publish-ready-section">
                    <div className="publish-ready-section-header">
                        <h2>Caption</h2>
                        <button
                            className={`publish-ready-btn small ${captionCopied ? 'success' : ''}`}
                            onClick={copyCaption}
                        >
                            {captionCopied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                        </button>
                    </div>
                    <div className="publish-ready-caption">
                        {post.caption || '(No caption)'}
                    </div>
                </div>

                {/* Media section */}
                {mediaTotal > 0 && (
                    <div className="publish-ready-section">
                        <div className="publish-ready-section-header">
                            <h2>Media ({mediaDownloaded}/{mediaTotal} saved)</h2>
                            <button
                                className="publish-ready-btn small"
                                onClick={downloadAllMedia}
                                disabled={mediaDownloaded === mediaTotal}
                            >
                                <Download size={14} />
                                {mediaDownloaded === mediaTotal ? 'All saved' : 'Save all'}
                            </button>
                        </div>
                        <div className="publish-ready-media-grid">
                            {post.media.map((m, i) => (
                                <div key={m.id} className="publish-ready-media-item">
                                    {m.type === 'video' ? (
                                        <video src={m.url} className="publish-ready-thumb" muted />
                                    ) : (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={m.url} alt={`Media ${i + 1}`} className="publish-ready-thumb" />
                                    )}
                                    <div className="publish-ready-media-status">
                                        {mediaStatuses[m.id] === 'downloading' && <Loader2 size={16} className="publish-ready-spinner-small" />}
                                        {mediaStatuses[m.id] === 'done' && <Check size={16} className="publish-ready-check" />}
                                        {mediaStatuses[m.id] === 'error' && (
                                            <button className="publish-ready-retry" onClick={() => downloadMedia(m.id, m.url, i)}>
                                                Retry
                                            </button>
                                        )}
                                        {mediaStatuses[m.id] === 'idle' && (
                                            <button className="publish-ready-retry" onClick={() => downloadMedia(m.id, m.url, i)}>
                                                <Download size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="publish-ready-actions">
                    <button
                        className="publish-ready-btn primary"
                        onClick={() => router.push(`/calendar?highlight=${postId}`)}
                    >
                        <ExternalLink size={16} />
                        Open in Calendar
                    </button>
                </div>
            </div>

            <style jsx>{`
                .publish-ready-container {
                    min-height: 100dvh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    background: var(--bg-primary, #0F0F12);
                }
                .publish-ready-card {
                    width: 100%;
                    max-width: 480px;
                    background: var(--bg-secondary, #1A1A2E);
                    border-radius: 16px;
                    padding: 32px 24px;
                    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
                }
                .publish-ready-header {
                    text-align: center;
                    margin-bottom: 28px;
                }
                .publish-ready-emoji {
                    font-size: 48px;
                    display: block;
                    margin-bottom: 12px;
                }
                .publish-ready-card h1 {
                    font-size: 22px;
                    font-weight: 700;
                    color: var(--text-primary, #fff);
                    margin: 0 0 6px;
                }
                .publish-ready-muted {
                    color: var(--text-muted, #888);
                    font-size: 14px;
                    margin: 0;
                }
                .publish-ready-section {
                    margin-bottom: 20px;
                }
                .publish-ready-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .publish-ready-section-header h2 {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-secondary, #ccc);
                    margin: 0;
                }
                .publish-ready-caption {
                    background: var(--bg-tertiary, rgba(255,255,255,0.04));
                    border-radius: 10px;
                    padding: 14px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: var(--text-primary, #fff);
                    white-space: pre-wrap;
                    word-break: break-word;
                    max-height: 200px;
                    overflow-y: auto;
                }
                .publish-ready-media-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                    gap: 8px;
                }
                .publish-ready-media-item {
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    aspect-ratio: 1;
                    background: var(--bg-tertiary, rgba(255,255,255,0.04));
                }
                .publish-ready-thumb {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .publish-ready-media-status {
                    position: absolute;
                    bottom: 4px;
                    right: 4px;
                    background: rgba(0,0,0,0.6);
                    border-radius: 6px;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                }
                .publish-ready-check {
                    color: #4ade80;
                }
                .publish-ready-spinner, .publish-ready-spinner-small {
                    animation: spin 1s linear infinite;
                    color: var(--accent-gold, #D4A574);
                }
                .publish-ready-spinner {
                    width: 36px;
                    height: 36px;
                    margin: 0 auto 16px;
                    display: block;
                }
                .publish-ready-error-icon {
                    width: 36px;
                    height: 36px;
                    margin: 0 auto 16px;
                    display: block;
                    color: #f87171;
                }
                .publish-ready-retry {
                    background: none;
                    border: none;
                    color: var(--accent-gold, #D4A574);
                    cursor: pointer;
                    font-size: 12px;
                    padding: 2px;
                    display: flex;
                    align-items: center;
                }
                .publish-ready-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: opacity 0.15s;
                }
                .publish-ready-btn:hover { opacity: 0.85; }
                .publish-ready-btn:disabled { opacity: 0.5; cursor: default; }
                .publish-ready-btn.small {
                    padding: 6px 12px;
                    font-size: 13px;
                    background: var(--bg-tertiary, rgba(255,255,255,0.08));
                    color: var(--text-primary, #fff);
                }
                .publish-ready-btn.small.success {
                    background: rgba(74, 222, 128, 0.15);
                    color: #4ade80;
                }
                .publish-ready-btn.primary {
                    width: 100%;
                    justify-content: center;
                    padding: 14px;
                    font-size: 15px;
                    background: var(--accent-gold, #D4A574);
                    color: #000;
                    border-radius: 10px;
                }
                .publish-ready-actions {
                    margin-top: 24px;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
