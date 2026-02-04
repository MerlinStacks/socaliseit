'use client';

/**
 * Post Comment Thread
 * Collaboration tool for team feedback on scheduled posts.
 *
 * Why: Enables team members to leave comments, suggestions, and
 * approvals on posts before publishing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Send,
    Check,
    CheckCircle,
    Reply,
    Trash2,
    MoreHorizontal,
    Loader2,
    User,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { format, formatDistanceToNow } from 'date-fns';

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// COMPONENT
// ============================================================================

export function PostCommentThread({
    postId,
    onCommentCountChange,
}: PostCommentThreadProps) {
    const { data: session } = useSession();
    const [comments, setComments] = useState<PostComment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

    // Fetch comments
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
                // Ignore errors
            } finally {
                setIsLoading(false);
            }
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
                setComments((prev) => [comment, ...prev]);
                setNewComment('');
                onCommentCountChange?.(comments.length + 1);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [newComment, isSubmitting, postId, comments.length, onCommentCountChange]);

    const handleAddReply = useCallback(
        async (commentId: string) => {
            if (!replyText.trim() || isSubmitting) return;

            setIsSubmitting(true);
            try {
                const response = await fetch(
                    `/api/posts/${postId}/comments/${commentId}/replies`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: replyText }),
                    }
                );

                if (response.ok) {
                    const reply = await response.json();
                    setComments((prev) =>
                        prev.map((c) =>
                            c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
                        )
                    );
                    setReplyingTo(null);
                    setReplyText('');
                }
            } finally {
                setIsSubmitting(false);
            }
        },
        [replyText, isSubmitting, postId]
    );

    const handleResolve = useCallback(
        async (commentId: string) => {
            try {
                const response = await fetch(
                    `/api/posts/${postId}/comments/${commentId}/resolve`,
                    { method: 'PATCH' }
                );

                if (response.ok) {
                    setComments((prev) =>
                        prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
                    );
                }
            } catch {
                // Ignore errors
            }
        },
        [postId]
    );

    const handleDelete = useCallback(
        async (commentId: string) => {
            try {
                const response = await fetch(
                    `/api/posts/${postId}/comments/${commentId}`,
                    { method: 'DELETE' }
                );

                if (response.ok) {
                    setComments((prev) => prev.filter((c) => c.id !== commentId));
                    onCommentCountChange?.(comments.length - 1);
                }
            } catch {
                // Ignore errors
            }
        },
        [postId, comments.length, onCommentCountChange]
    );

    const toggleExpanded = (commentId: string) => {
        setExpandedComments((prev) => {
            const next = new Set(prev);
            if (next.has(commentId)) {
                next.delete(commentId);
            } else {
                next.add(commentId);
            }
            return next;
        });
    };

    if (isLoading) {
        return (
            <div style={containerStyle}>
                <div style={loadingStyle}>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Loading comments...</span>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <MessageSquare size={16} />
                <span style={titleStyle}>Team Comments</span>
                <span style={countBadgeStyle}>{comments.length}</span>
            </div>

            {/* New Comment Input */}
            <div style={newCommentStyle}>
                <div style={avatarStyle}>
                    {session?.user?.image ? (
                        <img
                            src={session.user.image}
                            alt=""
                            style={avatarImageStyle}
                        />
                    ) : (
                        <User size={14} />
                    )}
                </div>
                <div style={inputWrapperStyle}>
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment or feedback..."
                        rows={2}
                        style={textareaStyle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleAddComment();
                            }
                        }}
                    />
                    <button
                        onClick={handleAddComment}
                        disabled={!newComment.trim() || isSubmitting}
                        style={sendButtonStyle}
                        type="button"
                    >
                        {isSubmitting ? (
                            <Loader2 className="animate-spin" size={14} />
                        ) : (
                            <Send size={14} />
                        )}
                    </button>
                </div>
            </div>

            {/* Comments List */}
            <div style={commentsListStyle}>
                {comments.length === 0 ? (
                    <p style={emptyStyle}>No comments yet. Be the first to leave feedback!</p>
                ) : (
                    comments.map((comment) => (
                        <div
                            key={comment.id}
                            style={{
                                ...commentStyle,
                                ...(comment.resolved ? resolvedCommentStyle : {}),
                            }}
                        >
                            <div style={commentHeaderStyle}>
                                <div style={avatarStyle}>
                                    {comment.userAvatar ? (
                                        <img
                                            src={comment.userAvatar}
                                            alt=""
                                            style={avatarImageStyle}
                                        />
                                    ) : (
                                        <User size={14} />
                                    )}
                                </div>
                                <div style={commentMetaStyle}>
                                    <span style={commentAuthorStyle}>
                                        {comment.userName || 'Team Member'}
                                    </span>
                                    <span style={commentTimeStyle}>
                                        {formatDistanceToNow(new Date(comment.createdAt), {
                                            addSuffix: true,
                                        })}
                                    </span>
                                </div>
                                {comment.resolved && (
                                    <span style={resolvedBadgeStyle}>
                                        <CheckCircle size={12} />
                                        Resolved
                                    </span>
                                )}
                            </div>

                            <p style={commentTextStyle}>{comment.text}</p>

                            <div style={commentActionsStyle}>
                                <button
                                    onClick={() => {
                                        setReplyingTo(
                                            replyingTo === comment.id ? null : comment.id
                                        );
                                    }}
                                    style={actionButtonStyle}
                                    type="button"
                                >
                                    <Reply size={12} />
                                    Reply
                                </button>

                                {!comment.resolved &&
                                    session?.user?.id === comment.userId && (
                                        <button
                                            onClick={() => handleResolve(comment.id)}
                                            style={actionButtonStyle}
                                            type="button"
                                        >
                                            <Check size={12} />
                                            Resolve
                                        </button>
                                    )}

                                {session?.user?.id === comment.userId && (
                                    <button
                                        onClick={() => handleDelete(comment.id)}
                                        style={{ ...actionButtonStyle, color: '#ef4444' }}
                                        type="button"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>

                            {/* Replies */}
                            {comment.replies.length > 0 && (
                                <div style={repliesContainerStyle}>
                                    {comment.replies.length > 2 &&
                                        !expandedComments.has(comment.id) && (
                                            <button
                                                onClick={() => toggleExpanded(comment.id)}
                                                style={showMoreStyle}
                                                type="button"
                                            >
                                                Show {comment.replies.length - 1} more replies
                                            </button>
                                        )}

                                    {(expandedComments.has(comment.id)
                                        ? comment.replies
                                        : comment.replies.slice(-1)
                                    ).map((reply) => (
                                        <div key={reply.id} style={replyStyle}>
                                            <div style={replyHeaderStyle}>
                                                <div style={smallAvatarStyle}>
                                                    {reply.userAvatar ? (
                                                        <img
                                                            src={reply.userAvatar}
                                                            alt=""
                                                            style={smallAvatarImageStyle}
                                                        />
                                                    ) : (
                                                        <User size={10} />
                                                    )}
                                                </div>
                                                <span style={replyAuthorStyle}>
                                                    {reply.userName || 'Team Member'}
                                                </span>
                                                <span style={replyTimeStyle}>
                                                    {formatDistanceToNow(new Date(reply.createdAt), {
                                                        addSuffix: true,
                                                    })}
                                                </span>
                                            </div>
                                            <p style={replyTextStyle}>{reply.text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Reply Input */}
                            {replyingTo === comment.id && (
                                <div style={replyInputStyle}>
                                    <input
                                        type="text"
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder="Write a reply..."
                                        style={replyInputFieldStyle}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleAddReply(comment.id);
                                            }
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => handleAddReply(comment.id)}
                                        disabled={!replyText.trim()}
                                        style={replySubmitStyle}
                                        type="button"
                                    >
                                        <Send size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.08)',
};

const loadingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#fff',
};

const titleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
};

const countBadgeStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '2px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
};

const newCommentStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
};

const avatarStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    flexShrink: 0,
    overflow: 'hidden',
};

const avatarImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

const inputWrapperStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    gap: 8,
};

const textareaStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    resize: 'none',
    outline: 'none',
};

const sendButtonStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const commentsListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 400,
    overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: 20,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
};

const commentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    borderLeft: '3px solid #6366f1',
};

const resolvedCommentStyle: React.CSSProperties = {
    opacity: 0.6,
    borderLeftColor: '#10b981',
};

const commentHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};

const commentMetaStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
};

const commentAuthorStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: '#fff',
};

const commentTimeStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
};

const resolvedBadgeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    padding: '2px 6px',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    borderRadius: 10,
};

const commentTextStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 1.5,
};

const commentActionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginTop: 4,
};

const actionButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    fontSize: 11,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
};

const repliesContainerStyle: React.CSSProperties = {
    marginLeft: 20,
    paddingLeft: 10,
    borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const showMoreStyle: React.CSSProperties = {
    padding: '4px 0',
    fontSize: 11,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#8b8efc',
    cursor: 'pointer',
    textAlign: 'left',
};

const replyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
};

const replyHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};

const smallAvatarStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
};

const smallAvatarImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

const replyAuthorStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: '#fff',
};

const replyTimeStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
};

const replyTextStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 24,
};

const replyInputStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
    marginTop: 4,
    marginLeft: 20,
};

const replyInputFieldStyle: React.CSSProperties = {
    flex: 1,
    padding: '6px 10px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    outline: 'none',
};

const replySubmitStyle: React.CSSProperties = {
    padding: '6px 10px',
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

export default PostCommentThread;
