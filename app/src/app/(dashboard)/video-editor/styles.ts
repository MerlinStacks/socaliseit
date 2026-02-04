/**
 * Video Editor Styles
 * Extracted styles for video editor components.
 */

import React from 'react';

export const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    color: '#fff',
    overflow: 'hidden',
};

export const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexShrink: 0,
};

export const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
};

export const iconButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

export const exportButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

export const mainContentStyle: React.CSSProperties = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
};

export const leftSidebarStyle: React.CSSProperties = {
    width: 240,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    padding: 0,
    overflowY: 'hidden',
    display: 'flex',
    flexDirection: 'column',
};

export const centerPanelStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    overflow: 'hidden',
};

export const previewContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: 900,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

export const aspectBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
};

export const rightSidebarStyle: React.CSSProperties = {
    width: 260,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    padding: 12,
    overflowY: 'auto',
};

export const timelineContainerStyle: React.CSSProperties = {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    flexShrink: 0,
};

export const transportStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
};

export const timecodeStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    minWidth: 120,
};

export const transportButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

export const playButtonStyle: React.CSSProperties = {
    color: '#fff',
    cursor: 'pointer',
};

export const sidebarTabsStyle: React.CSSProperties = {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

export const sidebarTabStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
};

export const textPanelStyle: React.CSSProperties = {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
};

export const addTextButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '12px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: 6,
    color: '#6366f1',
    fontWeight: 600,
    cursor: 'pointer',
};

export const helperTextStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 1.5,
};
