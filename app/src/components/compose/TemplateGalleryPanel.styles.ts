/**
 * Template Gallery Panel Styles
 * Extracted from TemplateGalleryPanel.tsx for 200-line standard compliance
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
    padding: 24,
    color: 'rgba(255, 255, 255, 0.5)',
};

export const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

export const headerLeftStyle: React.CSSProperties = {
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

export const saveButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: 'none',
    borderRadius: 4,
    color: '#8b8efc',
    cursor: 'pointer',
};

export const filtersStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

export const searchWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 6,
};

export const searchInputStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    outline: 'none',
};

export const categoryPillsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

export const categoryPillStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
};

export const categoryPillActiveStyle: React.CSSProperties = {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
    color: '#8b8efc',
};

export const gridStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 300,
    overflowY: 'auto',
};

export const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 24,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
};

export const createFirstButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    marginTop: 8,
    fontSize: 12,
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

export const templateCardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    border: '1px solid rgba(255, 255, 255, 0.06)',
};

export const templateHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

export const templateNameStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: '#fff',
};

export const templateActionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
};

export const iconButtonStyle: React.CSSProperties = {
    padding: 4,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.3)',
    cursor: 'pointer',
};

export const templateCaptionStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.4,
};

export const hashtagsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
};

export const hashtagStyle: React.CSSProperties = {
    fontSize: 10,
    padding: '2px 6px',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    color: '#8b8efc',
    borderRadius: 4,
};

export const moreHashtagsStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
};

export const templateFooterStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
};

export const categoryTagStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
};

export const usageCountStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
};

export const useButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
};

// Modal styles
export const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
};

export const modalStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
};

export const modalHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
};

export const modalTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    color: '#fff',
};

export const closeButtonStyle: React.CSSProperties = {
    padding: 4,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
};

export const modalBodyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
};

export const inputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

export const inputLabelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
};

export const modalInputStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    outline: 'none',
};

export const previewBoxStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

export const previewTextStyle: React.CSSProperties = {
    margin: 0,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 6,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.4,
};

export const modalFooterStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
};

export const cancelButtonStyle: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 13,
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
};

export const confirmButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    fontSize: 13,
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};
