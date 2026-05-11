/**
 * Post Failed Page
 * Mobile-friendly landing page shown when a push notification for a failed post is tapped.
 *
 * Why: Gives users two clear actions — retry publishing via API, or manually post
 * via the /publish-ready flow — instead of dumping them into the calendar editor.
 */

'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, RefreshCw, Upload, ArrowLeft } from 'lucide-react';
import { clientLogger } from '@/lib/client-logger';

interface PostData {
    id: string;
    caption: string;
    status: string;
    platforms: Array<{ platform: string; name: string }>;
    media: Array<{ id: string; url: string; type: string }>;
}

interface PublishError {
    platform: string;
    errorHuman: string;
    suggestion: string | null;
    occurredAt: string;
}

type RetryState = 'idle' | 'loading' | 'success' | 'error';

export default function PostFailedPage() {
    return (
        <Suspense fallback={
            <div className="pf-container">
                <Loader2 className="pf-spinner" />
            </div>
        }>
            <PostFailedContent />
        </Suspense>
    );
}

function PostFailedContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const postId = searchParams.get('postId');
    const autoAction = searchParams.get('action');

    const [post, setPost] = useState<PostData | null>(null);
    const [errors, setErrors] = useState<PublishError[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [retryState, setRetryState] = useState<RetryState>('idle');
    const [retryError, setRetryError] = useState<string | null>(null);
    const autoTriggered = useRef(false);

    // Fetch post data and publish errors
    useEffect(() => {
        if (!postId) {
            setFetchError('No post ID provided');
            setLoading(false);
            return;
        }

        Promise.all([
            fetch(`/api/posts/${postId}`).then(async (res) => {
                if (!res.ok) throw new Error('Failed to load post');
                return res.json();
            }),
            fetch(`/api/posts/${postId}/errors`).then(async (res) => {
                if (!res.ok) return [];
                return res.json();
            }).catch(() => []),
        ])
            .then(([postData, errorsData]) => {
                setPost(postData);
                setErrors(errorsData);
                setLoading(false);
            })
            .catch((err) => {
                clientLogger.error({ err }, 'Failed to fetch post for post-failed page');
                setFetchError('Could not load post. You may need to log in first.');
                setLoading(false);
            });
    }, [postId]);

    /** Retry publishing via the PATCH API */
    const handleRetry = useCallback(async () => {
        if (!postId || retryState === 'loading') return;
        setRetryState('loading');
        setRetryError(null);

        try {
            const res = await fetch(`/api/posts/${postId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry' }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Retry failed');
            }

            setRetryState('success');
        } catch (err) {
            clientLogger.error({ err }, 'Failed to retry post');
            setRetryError(err instanceof Error ? err.message : 'Retry failed');
            setRetryState('error');
        }
    }, [postId, retryState]);

    /** Navigate to manual post page */
    const handleManualPost = useCallback(() => {
        router.push(`/publish-ready?postId=${postId}`);
    }, [router, postId]);

    // Auto-trigger retry if the notification action button was tapped
    useEffect(() => {
        if (autoAction === 'retry' && post && !autoTriggered.current) {
            autoTriggered.current = true;
            handleRetry();
        }
    }, [autoAction, post, handleRetry]);

    const platformName = post?.platforms?.[0]?.name || 'Unknown';
    const platformKey = post?.platforms?.[0]?.platform || '';
    const latestError = errors[0];

    if (loading) {
        return (
            <div className="pf-container">
                <div className="pf-card">
                    <Loader2 className="pf-spinner" />
                    <h1>Loading post details...</h1>
                    <p className="pf-muted">Fetching failure information</p>
                </div>
                <PostFailedStyles />
            </div>
        );
    }

    if (fetchError || !post) {
        return (
            <div className="pf-container">
                <div className="pf-card">
                    <AlertCircle className="pf-error-icon" />
                    <h1>Something went wrong</h1>
                    <p className="pf-muted">{fetchError || 'Post not found'}</p>
                    <button className="pf-btn primary" onClick={() => router.push('/calendar')}>
                        Go to Calendar
                    </button>
                </div>
                <PostFailedStyles />
            </div>
        );
    }

    return (
        <div className="pf-container">
            <div className="pf-card">
                {/* Header */}
                <div className="pf-header">
                    <span className="pf-emoji">❌</span>
                    <h1>Post Failed to Publish</h1>
                    <p className="pf-muted">
                        {platformKey
                            ? `Failed on ${platformName}`
                            : 'Publishing failed'}
                    </p>
                </div>

                {/* Error details */}
                {latestError && (
                    <div className="pf-section">
                        <div className="pf-error-box">
                            <p className="pf-error-text">{latestError.errorHuman}</p>
                            {latestError.suggestion && (
                                <p className="pf-suggestion">{latestError.suggestion}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Caption preview */}
                <div className="pf-section">
                    <h2 className="pf-section-title">Post Preview</h2>
                    <div className="pf-caption">
                        {(post.caption || '(No caption)').slice(0, 200)}
                        {(post.caption || '').length > 200 ? '...' : ''}
                    </div>
                </div>

                {/* Media preview */}
                {post.media?.length > 0 && (
                    <div className="pf-section">
                        <div className="pf-media-row">
                            {post.media.slice(0, 3).map((m) => (
                                <div key={m.id} className="pf-media-thumb">
                                    {m.type === 'video' ? (
                                        <video src={m.url} className="pf-thumb-img" muted />
                                    ) : (
                                         
                                        <img src={m.url} alt="" className="pf-thumb-img" />
                                    )}
                                </div>
                            ))}
                            {post.media.length > 3 && (
                                <div className="pf-media-more">+{post.media.length - 3}</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="pf-actions">
                    {retryState === 'success' ? (
                        <div className="pf-success-box">
                            <p>✅ Post queued for retry!</p>
                            <p className="pf-muted">You&apos;ll be notified once it publishes.</p>
                        </div>
                    ) : (
                        <>
                            <button
                                className="pf-btn primary"
                                onClick={handleRetry}
                                disabled={retryState === 'loading'}
                            >
                                {retryState === 'loading' ? (
                                    <><Loader2 size={16} className="pf-btn-spinner" /> Retrying...</>
                                ) : (
                                    <><RefreshCw size={16} /> Retry Publishing</>
                                )}
                            </button>

                            {retryState === 'error' && retryError && (
                                <p className="pf-retry-error">{retryError}</p>
                            )}

                            <button className="pf-btn secondary" onClick={handleManualPost}>
                                <Upload size={16} /> Post Manually
                            </button>
                        </>
                    )}
                </div>

                {/* Back link */}
                <button
                    className="pf-back-link"
                    onClick={() => router.push('/calendar')}
                >
                    <ArrowLeft size={14} /> Back to Calendar
                </button>
            </div>

            <PostFailedStyles />
        </div>
    );
}

/** Why: Self-contained styles matching the publish-ready pattern for consistency */
function PostFailedStyles() {
    return (
        <style jsx global>{`
            .pf-container {
                min-height: 100dvh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: var(--bg-primary, #0F0F12);
            }
            .pf-card {
                width: 100%;
                max-width: 480px;
                background: var(--bg-secondary, #1A1A2E);
                border-radius: 16px;
                padding: 32px 24px;
                border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
            }
            .pf-header {
                text-align: center;
                margin-bottom: 24px;
            }
            .pf-emoji {
                font-size: 48px;
                display: block;
                margin-bottom: 12px;
            }
            .pf-card h1 {
                font-size: 22px;
                font-weight: 700;
                color: var(--text-primary, #fff);
                margin: 0 0 6px;
            }
            .pf-muted {
                color: var(--text-muted, #888);
                font-size: 14px;
                margin: 0;
            }
            .pf-section {
                margin-bottom: 16px;
            }
            .pf-section-title {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-secondary, #ccc);
                margin: 0 0 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .pf-error-box {
                background: rgba(239, 68, 68, 0.08);
                border: 1px solid rgba(239, 68, 68, 0.2);
                border-radius: 10px;
                padding: 14px;
            }
            .pf-error-text {
                color: #f87171;
                font-size: 14px;
                margin: 0;
                line-height: 1.5;
            }
            .pf-suggestion {
                color: var(--text-muted, #888);
                font-size: 13px;
                margin: 8px 0 0;
                line-height: 1.4;
            }
            .pf-caption {
                background: var(--bg-tertiary, rgba(255,255,255,0.04));
                border-radius: 10px;
                padding: 14px;
                font-size: 14px;
                line-height: 1.6;
                color: var(--text-primary, #fff);
                white-space: pre-wrap;
                word-break: break-word;
            }
            .pf-media-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .pf-media-thumb {
                width: 64px;
                height: 64px;
                border-radius: 8px;
                overflow: hidden;
                flex-shrink: 0;
                background: var(--bg-tertiary, rgba(255,255,255,0.04));
            }
            .pf-thumb-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .pf-media-more {
                width: 64px;
                height: 64px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--bg-tertiary, rgba(255,255,255,0.04));
                color: var(--text-muted, #888);
                font-size: 14px;
                font-weight: 600;
                flex-shrink: 0;
            }
            .pf-actions {
                margin-top: 24px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .pf-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 600;
                font-size: 15px;
                padding: 14px;
                width: 100%;
                transition: opacity 0.15s, transform 0.1s;
            }
            .pf-btn:hover { opacity: 0.9; }
            .pf-btn:active { transform: scale(0.98); }
            .pf-btn:disabled { opacity: 0.5; cursor: default; transform: none; }
            .pf-btn.primary {
                background: var(--accent-gold, #D4A574);
                color: #000;
            }
            .pf-btn.secondary {
                background: var(--bg-tertiary, rgba(255,255,255,0.08));
                color: var(--text-primary, #fff);
            }
            .pf-btn-spinner {
                animation: pf-spin 1s linear infinite;
            }
            .pf-retry-error {
                color: #f87171;
                font-size: 13px;
                text-align: center;
                margin: 0;
            }
            .pf-success-box {
                text-align: center;
                background: rgba(74, 222, 128, 0.08);
                border: 1px solid rgba(74, 222, 128, 0.2);
                border-radius: 10px;
                padding: 20px 14px;
            }
            .pf-success-box p:first-child {
                font-size: 16px;
                font-weight: 600;
                color: #4ade80;
                margin: 0 0 6px;
            }
            .pf-back-link {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin-top: 20px;
                background: none;
                border: none;
                color: var(--text-muted, #888);
                font-size: 14px;
                cursor: pointer;
                width: 100%;
                transition: color 0.15s;
            }
            .pf-back-link:hover { color: var(--text-primary, #fff); }
            .pf-spinner {
                width: 36px;
                height: 36px;
                margin: 0 auto 16px;
                display: block;
                color: var(--accent-gold, #D4A574);
                animation: pf-spin 1s linear infinite;
            }
            .pf-error-icon {
                width: 36px;
                height: 36px;
                margin: 0 auto 16px;
                display: block;
                color: #f87171;
            }
            @keyframes pf-spin {
                to { transform: rotate(360deg); }
            }
        `}</style>
    );
}
