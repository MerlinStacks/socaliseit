'use client';

/**
 * AI Tools Panel
 * Container for all AI-powered video editing tools.
 * 
 * Why: Centralized access to AI features with tabbed interface.
 */

import React, { useState } from 'react';
import {
    Wand2,
    Captions,
    Scissors,
    Music,
    Film,
    LayoutTemplate,
    Sparkles,
    Repeat2,
    ImagePlus,
} from 'lucide-react';
import { AutoCaptionsPanel } from './AutoCaptionsPanel';
import { SilenceRemovalPanel } from './SilenceRemovalPanel';
import { BeatSyncPanel } from './BeatSyncPanel';
import { TemplateGallery } from './TemplateGallery';
import { SceneDetectionPanel } from './SceneDetectionPanel';
import { ContentRepurposingPanel } from './ContentRepurposingPanel';
import { BrollSuggestionsPanel } from './BrollSuggestionsPanel';

type AITool = 'captions' | 'silence' | 'beats' | 'scenes' | 'broll' | 'repurpose' | 'templates';

interface AIToolsTab {
    id: AITool;
    name: string;
    icon: React.ReactNode;
    description: string;
    available: boolean;
}

const AI_TOOLS: AIToolsTab[] = [
    {
        id: 'captions',
        name: 'Captions',
        icon: <Captions size={16} />,
        description: 'Auto-generate captions from speech',
        available: true,
    },
    {
        id: 'silence',
        name: 'Silence',
        icon: <Scissors size={16} />,
        description: 'Detect and remove silent gaps',
        available: true,
    },
    {
        id: 'beats',
        name: 'Beat Sync',
        icon: <Music size={16} />,
        description: 'Sync cuts to music beats',
        available: true,
    },
    {
        id: 'scenes',
        name: 'Scenes',
        icon: <Film size={16} />,
        description: 'Detect scene changes',
        available: true,
    },
    {
        id: 'broll',
        name: 'B-Roll',
        icon: <ImagePlus size={16} />,
        description: 'AI-suggested B-roll from library',
        available: true,
    },
    {
        id: 'repurpose',
        name: 'Repurpose',
        icon: <Repeat2 size={16} />,
        description: 'Create platform variants',
        available: true,
    },
    {
        id: 'templates',
        name: 'Templates',
        icon: <LayoutTemplate size={16} />,
        description: 'One-click video templates',
        available: true,
    },
];

export const AIToolsPanel: React.FC = () => {
    const [activeTool, setActiveTool] = useState<AITool>('captions');

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <Wand2 size={18} />
                <span style={{ fontWeight: 600 }}>AI Tools</span>
                <Sparkles size={14} style={{ color: '#fbbf24' }} />
            </div>

            {/* Tool tabs */}
            <div style={tabsContainerStyle}>
                {AI_TOOLS.map(tool => (
                    <button
                        key={tool.id}
                        onClick={() => tool.available && setActiveTool(tool.id)}
                        style={{
                            ...tabStyle,
                            backgroundColor: activeTool === tool.id
                                ? 'rgba(99, 102, 241, 0.2)'
                                : 'transparent',
                            borderColor: activeTool === tool.id
                                ? '#6366f1'
                                : 'transparent',
                            opacity: tool.available ? 1 : 0.5,
                            cursor: tool.available ? 'pointer' : 'not-allowed',
                        }}
                        title={tool.description}
                        disabled={!tool.available}
                    >
                        {tool.icon}
                        <span style={{ fontSize: 11 }}>{tool.name}</span>
                        {!tool.available && (
                            <span style={comingSoonBadge}>Soon</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Active tool panel */}
            <div style={panelContentStyle}>
                {activeTool === 'captions' && <AutoCaptionsPanel />}
                {activeTool === 'silence' && <SilenceRemovalPanel />}
                {activeTool === 'beats' && <BeatSyncPanel />}
                {activeTool === 'scenes' && <SceneDetectionPanel />}
                {activeTool === 'broll' && <BrollSuggestionsPanel />}
                {activeTool === 'repurpose' && <ContentRepurposingPanel />}
                {activeTool === 'templates' && <TemplateGallery />}
            </div>
        </div>
    );
};

// Placeholder for coming soon features
const ComingSoonPlaceholder: React.FC<{ feature: string }> = ({ feature }) => (
    <div style={placeholderStyle}>
        <Sparkles size={32} style={{ color: '#6366f1', marginBottom: 12 }} />
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{feature}</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Coming soon
        </p>
    </div>
);

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 14,
    color: '#fff',
};

const tabsContainerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 4,
    padding: 8,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const tabStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '8px 4px',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative',
};

const comingSoonBadge: React.CSSProperties = {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 8,
    padding: '1px 4px',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    color: '#fbbf24',
    borderRadius: 4,
};

const panelContentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
};

const placeholderStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
};
