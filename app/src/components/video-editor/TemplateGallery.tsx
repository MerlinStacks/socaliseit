'use client';

/**
 * Template Gallery
 * Pre-built video editing templates for quick content creation.
 * 
 * Why: Speeds up repetitive editing workflows with one-click presets.
 */

import React, { useState, useCallback } from 'react';
import {
    LayoutTemplate,
    Play,
    Clock,
    ChevronRight,
    Sparkles,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

interface VideoTemplate {
    id: string;
    name: string;
    description: string;
    category: 'intro' | 'outro' | 'promo' | 'story' | 'montage';
    duration: number; // seconds
    platform: 'tiktok' | 'instagram' | 'youtube' | 'universal';
    thumbnail: string;
    structure: TemplateSection[];
}

interface TemplateSection {
    type: 'video' | 'text' | 'transition';
    name: string;
    durationFrames: number;
    style?: Record<string, unknown>;
}

// ============================================================================
// PRESET TEMPLATES
// ============================================================================

const TEMPLATES: VideoTemplate[] = [
    {
        id: 'tiktok-hook',
        name: 'TikTok Hook',
        description: 'Attention-grabbing intro with bold text',
        category: 'intro',
        duration: 3,
        platform: 'tiktok',
        thumbnail: '🎯',
        structure: [
            { type: 'text', name: 'Hook Text', durationFrames: 45 },
            { type: 'video', name: 'Opening Shot', durationFrames: 45 },
        ],
    },
    {
        id: 'instagram-story',
        name: 'Instagram Story',
        description: '15-second story with transitions',
        category: 'story',
        duration: 15,
        platform: 'instagram',
        thumbnail: '📱',
        structure: [
            { type: 'video', name: 'Scene 1', durationFrames: 150 },
            { type: 'transition', name: 'Fade', durationFrames: 15 },
            { type: 'video', name: 'Scene 2', durationFrames: 150 },
            { type: 'text', name: 'CTA', durationFrames: 90 },
        ],
    },
    {
        id: 'youtube-intro',
        name: 'YouTube Intro',
        description: 'Professional channel intro',
        category: 'intro',
        duration: 5,
        platform: 'youtube',
        thumbnail: '🎬',
        structure: [
            { type: 'video', name: 'Logo Reveal', durationFrames: 60 },
            { type: 'text', name: 'Channel Name', durationFrames: 60 },
            { type: 'transition', name: 'Fade Out', durationFrames: 30 },
        ],
    },
    {
        id: 'product-promo',
        name: 'Product Promo',
        description: 'Quick product showcase with features',
        category: 'promo',
        duration: 10,
        platform: 'universal',
        thumbnail: '🛍️',
        structure: [
            { type: 'text', name: 'Product Name', durationFrames: 60 },
            { type: 'video', name: 'Product Shot', durationFrames: 90 },
            { type: 'text', name: 'Feature 1', durationFrames: 60 },
            { type: 'video', name: 'Detail Shot', durationFrames: 60 },
            { type: 'text', name: 'CTA', durationFrames: 30 },
        ],
    },
    {
        id: 'fast-montage',
        name: 'Fast Montage',
        description: 'Quick cuts synced to beat',
        category: 'montage',
        duration: 8,
        platform: 'tiktok',
        thumbnail: '⚡',
        structure: [
            { type: 'video', name: 'Clip 1', durationFrames: 30 },
            { type: 'video', name: 'Clip 2', durationFrames: 30 },
            { type: 'video', name: 'Clip 3', durationFrames: 30 },
            { type: 'video', name: 'Clip 4', durationFrames: 30 },
            { type: 'video', name: 'Clip 5', durationFrames: 30 },
            { type: 'video', name: 'Clip 6', durationFrames: 30 },
            { type: 'video', name: 'Clip 7', durationFrames: 30 },
            { type: 'video', name: 'Clip 8', durationFrames: 30 },
        ],
    },
    {
        id: 'tutorial-style',
        name: 'Tutorial Style',
        description: 'Step-by-step instructional format',
        category: 'story',
        duration: 20,
        platform: 'youtube',
        thumbnail: '📚',
        structure: [
            { type: 'text', name: 'Title', durationFrames: 90 },
            { type: 'text', name: 'Step 1', durationFrames: 30 },
            { type: 'video', name: 'Demo 1', durationFrames: 150 },
            { type: 'text', name: 'Step 2', durationFrames: 30 },
            { type: 'video', name: 'Demo 2', durationFrames: 150 },
            { type: 'text', name: 'Summary', durationFrames: 90 },
        ],
    },
    {
        id: 'before-after',
        name: 'Before & After',
        description: 'Transformation reveal',
        category: 'promo',
        duration: 6,
        platform: 'universal',
        thumbnail: '✨',
        structure: [
            { type: 'text', name: 'Before', durationFrames: 30 },
            { type: 'video', name: 'Before Clip', durationFrames: 60 },
            { type: 'transition', name: 'Wipe', durationFrames: 30 },
            { type: 'text', name: 'After', durationFrames: 30 },
            { type: 'video', name: 'After Clip', durationFrames: 60 },
        ],
    },
    {
        id: 'subscribe-outro',
        name: 'Subscribe Outro',
        description: 'YouTube end screen template',
        category: 'outro',
        duration: 8,
        platform: 'youtube',
        thumbnail: '🔔',
        structure: [
            { type: 'text', name: 'Thanks for Watching', durationFrames: 60 },
            { type: 'text', name: 'Subscribe CTA', durationFrames: 90 },
            { type: 'video', name: 'End Card', durationFrames: 90 },
        ],
    },
];

const CATEGORIES = [
    { id: 'all', label: 'All', icon: LayoutTemplate },
    { id: 'intro', label: 'Intros', icon: Play },
    { id: 'promo', label: 'Promo', icon: Sparkles },
    { id: 'story', label: 'Story', icon: ChevronRight },
    { id: 'montage', label: 'Montage', icon: Clock },
    { id: 'outro', label: 'Outros', icon: ChevronRight },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const TemplateGallery: React.FC = () => {
    const { addTextOverlay } = useVideoProject();
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate | null>(null);

    const filteredTemplates = selectedCategory === 'all'
        ? TEMPLATES
        : TEMPLATES.filter(t => t.category === selectedCategory);

    /**
     * Apply template to timeline
     */
    const handleApplyTemplate = useCallback((template: VideoTemplate) => {
        // For now, just add placeholder text overlays for the structure
        let currentFrame = 0;

        for (const section of template.structure) {
            if (section.type === 'text') {
                addTextOverlay({
                    text: section.name,
                    startFrame: currentFrame,
                    durationFrames: section.durationFrames,
                    position: { x: 540, y: 960 },
                    style: {
                        fontSize: 48,
                        fontFamily: 'Inter, sans-serif',
                        color: '#ffffff',
                        backgroundColor: null,
                        fontWeight: 'bold',
                    },
                    animation: 'fade',
                });
            }
            currentFrame += section.durationFrames;
        }

        alert(`Applied "${template.name}" template! Add your media to the placeholder slots.`);
    }, [addTextOverlay]);

    /**
     * Get platform badge color
     */
    const getPlatformColor = (platform: string): string => {
        switch (platform) {
            case 'tiktok': return '#00f2ea';
            case 'instagram': return '#e1306c';
            case 'youtube': return '#ff0000';
            default: return '#6366f1';
        }
    };

    return (
        <div style={containerStyle}>
            {/* Category tabs */}
            <div style={categoryTabsStyle}>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                            ...categoryTabStyle,
                            backgroundColor: selectedCategory === cat.id
                                ? 'rgba(99, 102, 241, 0.2)'
                                : 'transparent',
                            borderColor: selectedCategory === cat.id
                                ? '#6366f1'
                                : 'rgba(255,255,255,0.1)',
                        }}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Template grid */}
            <div style={templateGridStyle}>
                {filteredTemplates.map(template => (
                    <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        style={{
                            ...templateCardStyle,
                            borderColor: selectedTemplate?.id === template.id
                                ? '#6366f1'
                                : 'rgba(255,255,255,0.08)',
                        }}
                    >
                        {/* Thumbnail */}
                        <div style={thumbnailStyle}>
                            <span style={{ fontSize: 32 }}>{template.thumbnail}</span>
                        </div>

                        {/* Info */}
                        <div style={templateInfoStyle}>
                            <div style={templateNameStyle}>{template.name}</div>
                            <div style={templateDescStyle}>{template.description}</div>

                            {/* Meta */}
                            <div style={templateMetaStyle}>
                                <span style={{
                                    ...platformBadgeStyle,
                                    color: getPlatformColor(template.platform),
                                    borderColor: getPlatformColor(template.platform),
                                }}>
                                    {template.platform}
                                </span>
                                <span style={durationBadgeStyle}>
                                    <Clock size={10} />
                                    {template.duration}s
                                </span>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Selected template preview */}
            {selectedTemplate && (
                <div style={previewPanelStyle}>
                    <div style={previewHeaderStyle}>
                        <span style={{ fontWeight: 600 }}>{selectedTemplate.name}</span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>
                            {selectedTemplate.structure.length} sections
                        </span>
                    </div>

                    {/* Structure preview */}
                    <div style={structurePreviewStyle}>
                        {selectedTemplate.structure.map((section, index) => (
                            <div
                                key={index}
                                style={{
                                    ...sectionPreviewStyle,
                                    backgroundColor: section.type === 'text'
                                        ? 'rgba(99, 102, 241, 0.3)'
                                        : section.type === 'video'
                                            ? 'rgba(34, 197, 94, 0.3)'
                                            : 'rgba(255, 255, 255, 0.2)',
                                    flex: section.durationFrames,
                                }}
                                title={`${section.name} (${Math.round(section.durationFrames / 30)}s)`}
                            >
                                <span style={sectionLabelStyle}>{section.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* Apply button */}
                    <button
                        onClick={() => handleApplyTemplate(selectedTemplate)}
                        style={applyButtonStyle}
                    >
                        <Sparkles size={14} />
                        Apply Template
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const categoryTabsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

const categoryTabStyle: React.CSSProperties = {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    color: '#fff',
    fontSize: 11,
    cursor: 'pointer',
};

const templateGridStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 250,
    overflowY: 'auto',
};

const templateCardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
};

const thumbnailStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    flexShrink: 0,
};

const templateInfoStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const templateNameStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
};

const templateDescStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
};

const templateMetaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
};

const platformBadgeStyle: React.CSSProperties = {
    fontSize: 9,
    textTransform: 'uppercase',
    padding: '2px 6px',
    border: '1px solid',
    borderRadius: 4,
};

const durationBadgeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
};

const previewPanelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
};

const previewHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#fff',
};

const structurePreviewStyle: React.CSSProperties = {
    display: 'flex',
    gap: 2,
    height: 32,
    borderRadius: 4,
    overflow: 'hidden',
};

const sectionPreviewStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
};

const sectionLabelStyle: React.CSSProperties = {
    fontSize: 8,
    color: '#fff',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    padding: '0 4px',
};

const applyButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 16px',
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};
