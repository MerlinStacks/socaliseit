/**
 * Video Editor Sidebar
 * Left sidebar with Media, Text, and AI tabs.
 */

'use client';

import React from 'react';
import { Film, Type, Wand2, Plus } from 'lucide-react';
import { MediaPicker, AIToolsPanel } from '@/components/video-editor';
import {
    leftSidebarStyle,
    sidebarTabsStyle,
    sidebarTabStyle,
    textPanelStyle,
    addTextButtonStyle,
    helperTextStyle,
} from './styles';

export type SidebarTab = 'media' | 'text' | 'ai';

interface EditorSidebarProps {
    activeTab: SidebarTab;
    onTabChange: (tab: SidebarTab) => void;
    onAddText: () => void;
}

/**
 * Left sidebar with tabbed content for media, text, and AI tools.
 */
export function EditorSidebar({
    activeTab,
    onTabChange,
    onAddText,
}: EditorSidebarProps) {
    return (
        <aside style={leftSidebarStyle}>
            {/* Sidebar Tabs */}
            <div style={sidebarTabsStyle}>
                <button
                    onClick={() => onTabChange('media')}
                    style={{
                        ...sidebarTabStyle,
                        borderBottom: activeTab === 'media' ? '2px solid #6366f1' : '2px solid transparent',
                        color: activeTab === 'media' ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                >
                    <Film size={14} />
                    Media
                </button>
                <button
                    onClick={() => onTabChange('text')}
                    style={{
                        ...sidebarTabStyle,
                        borderBottom: activeTab === 'text' ? '2px solid #6366f1' : '2px solid transparent',
                        color: activeTab === 'text' ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                >
                    <Type size={14} />
                    Text
                </button>
                <button
                    onClick={() => onTabChange('ai')}
                    style={{
                        ...sidebarTabStyle,
                        borderBottom: activeTab === 'ai' ? '2px solid #6366f1' : '2px solid transparent',
                        color: activeTab === 'ai' ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                >
                    <Wand2 size={14} />
                    AI
                </button>
            </div>

            {/* Sidebar Content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {activeTab === 'media' && <MediaPicker />}
                {activeTab === 'text' && (
                    <div style={textPanelStyle}>
                        <button onClick={onAddText} style={addTextButtonStyle}>
                            <Plus size={16} />
                            Add Text Overlay
                        </button>
                        <p style={helperTextStyle}>
                            Add text to the timeline using the button above.
                            Select text on the timeline to edit properties.
                        </p>
                    </div>
                )}
                {activeTab === 'ai' && <AIToolsPanel />}
            </div>
        </aside>
    );
}
