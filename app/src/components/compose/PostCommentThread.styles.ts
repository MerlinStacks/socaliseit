/**
 * Post Comment Thread Styles
 * Extracted from PostCommentThread.tsx for 200-line standard compliance
 */

import React from 'react';

export const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.08)',
};

export const loadingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
};

export const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#fff',
};

export const titleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
};

export const countBadgeStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '2px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
};

export const newCommentStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
};

export const avatarStyle: React.CSSProperties = {
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

export const avatarImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

export const inputWrapperStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    gap: 8,
};

export const textareaStyle: React.CSSProperties = {
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

export const sendButtonStyle: React.CSSProperties = {
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

export const commentsListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 400,
    overflowY: 'auto',
};

export const emptyStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: 20,
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
};

export const commentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    borderLeft: '3px solid #6366f1',
};

export const resolvedCommentStyle: React.CSSProperties = {
    opacity: 0.6,
    borderLeftColor: '#10b981',
};

export const commentHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};

export const commentMetaStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
};

export const commentAuthorStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: '#fff',
};

export const commentTimeStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
};

export const resolvedBadgeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    padding: '2px 6px',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    borderRadius: 10,
};

export const commentTextStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 1.5,
};

export const commentActionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginTop: 4,
};

export const actionButtonStyle: React.CSSProperties = {
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

export const repliesContainerStyle: React.CSSProperties = {
    marginLeft: 20,
    paddingLeft: 10,
    borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

export const showMoreStyle: React.CSSProperties = {
    padding: '4px 0',
    fontSize: 11,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#8b8efc',
    cursor: 'pointer',
    textAlign: 'left',
};

export const replyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
};

export const replyHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};

export const smallAvatarStyle: React.CSSProperties = {
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

export const smallAvatarImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

export const replyAuthorStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: '#fff',
};

export const replyTimeStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
};

export const replyTextStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 24,
};

export const replyInputStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
    marginTop: 4,
    marginLeft: 20,
};

export const replyInputFieldStyle: React.CSSProperties = {
    flex: 1,
    padding: '6px 10px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    outline: 'none',
};

export const replySubmitStyle: React.CSSProperties = {
    padding: '6px 10px',
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};
