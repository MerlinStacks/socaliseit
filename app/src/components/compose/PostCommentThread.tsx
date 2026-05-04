'use client';

/**
 * Post Comment Thread
 * Collaboration tool for team feedback on scheduled posts.
 *
 * Why: Enables team members to leave comments, suggestions, and
 * approvals on posts before publishing.
 * 
 * Decomposed for 200-line standard compliance - styles in PostCommentThread.styles.ts
 */

import { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Send,
    Check,
    CheckCircle,
    Reply,
    Trash2,
    Loader2,
    User,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/toast';
import * as styles from './PostCommentThread.styles';

// Types
interface PostCommentReply {
    id: string;
    userId: string;
    userName?: string;
    userAvatar?: string;
    text: string;
    createdAt: string;
}

interface PostComment {
    id: string;
    userId: string;
    userName?: string;
    userAvatar?: string;
    text: string;
    resolved: boolean;
    createdAt: string;
    replies: PostCommentReply[];
}

interface PostCommentThreadProps {
    postId: string;
    onCommentCountChange?: (count: number) => void;
}

export function PostCommentThread({ postId, onCommentCountChange }: PostCommentThreadProps) {
    const { data: session } = useSession();
    const [comments, setComments] = useState<PostComment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

    useEffect(() => {
        async function fetchComments() {
            try {
                const response = await fetch(`/api/posts/${postId}/comments`);
                if (response.ok) {
                    const data = await response.json();
                    setComments(data.comments || []);
                    onCommentCountChange?.(data.comments?.length || 0);
                }
            } catch {
                // Fetch errors are non-critical — comments section degrades gracefully
            } finally { setIsLoading(false); }
        }
        fetchComments();
    }, [postId, onCommentCountChange]);

    const handleAddComment = useCallback(async () => {
        if (!newComment.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: newComment }),
            });
            if (response.ok) {
                const comment = await response.json();
                setComments((prev) => {
                    onCommentCountChange?.(prev.length + 1);
                    return [comment, ...prev];
                });
                setNewComment('');
            } else {
                const err = await response.json();
                throw new Error(err.error || 'Failed to add comment');
            }
        } catch (error) {
            toast('error', 'Failed to add comment', error instanceof Error ? error.message : 'Please try again.');
        } finally { setIsSubmitting(false); }
    }, [newComment, isSubmitting, postId, onCommentCountChange]);

    const handleAddReply = useCallback(async (commentId: string) => {
        if (!replyText.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/posts/${postId}/comments/${commentId}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: replyText }),
            });
            if (response.ok) {
                const reply = await response.json();
                setComments((prev) =>
                    prev.map((c) => c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c)
                );
                setReplyingTo(null);
                setReplyText('');
            } else {
                const err = await response.json();
                throw new Error(err.error || 'Failed to add reply');
            }
        } catch (error) {
            toast('error', 'Failed to add reply', error instanceof Error ? error.message : 'Please try again.');
        } finally { setIsSubmitting(false); }
    }, [replyText, isSubmitting, postId]);

    const handleResolve = useCallback(async (commentId: string) => {
        try {
            const response = await fetch(`/api/posts/${postId}/comments/${commentId}/resolve`, { method: 'PATCH' });
            if (response.ok) {
                setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, resolved: true } : c));
            } else {
                const err = await response.json();
                throw new Error(err.error || 'Failed to resolve comment');
            }
        } catch (error) {
            toast('error', 'Failed to resolve', error instanceof Error ? error.message : 'Please try again.');
        }
    }, [postId]);

    const handleDelete = useCallback(async (commentId: string) => {
        try {
            const response = await fetch(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
            if (response.ok) {
                setComments((prev) => {
                    onCommentCountChange?.(prev.length - 1);
                    return prev.filter((c) => c.id !== commentId);
                });
            } else {
                const err = await response.json();
                throw new Error(err.error || 'Failed to delete comment');
            }
        } catch (error) {
            toast('error', 'Failed to delete', error instanceof Error ? error.message : 'Please try again.');
        }
    }, [postId, onCommentCountChange]);

    const toggleExpanded = (commentId: string) => {
        setExpandedComments((prev) => {
            const next = new Set(prev);
            if (next.has(commentId)) next.delete(commentId);
            else next.add(commentId);
            return next;
        });
    };

    if (isLoading) {
        return (
            <div style={styles.containerStyle}>
                <div style={styles.loadingStyle}>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Loading comments...</span>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.containerStyle}>
            <div style={styles.headerStyle}>
                <MessageSquare size={16} />
                <span style={styles.titleStyle}>Team Comments</span>
                <span style={styles.countBadgeStyle}>{comments.length}</span>
            </div>

            <div style={styles.newCommentStyle}>
                <div style={styles.avatarStyle}>
                    {session?.user?.image ? <img src={session.user.image} alt="" style={styles.avatarImageStyle} /> : <User size={14} />}
                </div>
                <div style={styles.inputWrapperStyle}>
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment or feedback..."
                        rows={2}
                        style={styles.textareaStyle}
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                    />
                    <button onClick={handleAddComment} disabled={!newComment.trim() || isSubmitting} style={styles.sendButtonStyle} type="button">
                        {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                    </button>
                </div>
            </div>

            <div style={styles.commentsListStyle}>
                {comments.length === 0 ? (
                    <p style={styles.emptyStyle}>No comments yet. Be the first to leave feedback!</p>
                ) : (
                    comments.map((comment) => (
                        <div key={comment.id} style={{ ...styles.commentStyle, ...(comment.resolved ? styles.resolvedCommentStyle : {}) }}>
                            <div style={styles.commentHeaderStyle}>
                                <div style={styles.avatarStyle}>
                                    {comment.userAvatar ? <img src={comment.userAvatar} alt="" style={styles.avatarImageStyle} /> : <User size={14} />}
                                </div>
                                <div style={styles.commentMetaStyle}>
                                    <span style={styles.commentAuthorStyle}>{comment.userName || 'Team Member'}</span>
                                    <span style={styles.commentTimeStyle}>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                                </div>
                                {comment.resolved && (<span style={styles.resolvedBadgeStyle}><CheckCircle size={12} />Resolved</span>)}
                            </div>
                            <p style={styles.commentTextStyle}>{comment.text}</p>
                            <div style={styles.commentActionsStyle}>
                                <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} style={styles.actionButtonStyle} type="button"><Reply size={12} />Reply</button>
                                {!comment.resolved && session?.user?.id === comment.userId && (<button onClick={() => handleResolve(comment.id)} style={styles.actionButtonStyle} type="button"><Check size={12} />Resolve</button>)}
                                {session?.user?.id === comment.userId && (<button onClick={() => handleDelete(comment.id)} style={{ ...styles.actionButtonStyle, color: '#ef4444' }} type="button"><Trash2 size={12} /></button>)}
                            </div>

                            {comment.replies.length > 0 && (
                                <div style={styles.repliesContainerStyle}>
                                    {comment.replies.length > 2 && !expandedComments.has(comment.id) && (
                                        <button onClick={() => toggleExpanded(comment.id)} style={styles.showMoreStyle} type="button">Show {comment.replies.length - 1} more replies</button>
                                    )}
                                    {(expandedComments.has(comment.id) ? comment.replies : comment.replies.slice(-1)).map((reply) => (
                                        <div key={reply.id} style={styles.replyStyle}>
                                            <div style={styles.replyHeaderStyle}>
                                                <div style={styles.smallAvatarStyle}>{reply.userAvatar ? <img src={reply.userAvatar} alt="" style={styles.smallAvatarImageStyle} /> : <User size={10} />}</div>
                                                <span style={styles.replyAuthorStyle}>{reply.userName || 'Team Member'}</span>
                                                <span style={styles.replyTimeStyle}>{formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}</span>
                                            </div>
                                            <p style={styles.replyTextStyle}>{reply.text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {replyingTo === comment.id && (
                                <div style={styles.replyInputStyle}>
                                    <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a reply..." style={styles.replyInputFieldStyle} onKeyDown={(e) => { if (e.key === 'Enter') handleAddReply(comment.id); }} autoFocus />
                                    <button onClick={() => handleAddReply(comment.id)} disabled={!replyText.trim()} style={styles.replySubmitStyle} type="button"><Send size={12} /></button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default PostCommentThread;
