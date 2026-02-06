'use client';

/**
 * Motion Graphics Panel
 * Animated overlays library for video content.
 */

import React, { useState, useCallback } from 'react';
import {
    Sparkles,
    Plus,
    Check,
} from 'lucide-react';
import { useVideoProject } from '@/hooks/useVideoProject';
import {
    MOTION_GRAPHICS,
    getCategories,
    getGraphicsByCategory,
    createGraphicInstance,
    type GraphicCategory,
    type MotionGraphic,
} from '@/lib/ai/motion-graphics';
import { logger } from '@/lib/logger';

export const MotionGraphicsPanel: React.FC = () => {
    const { project, addTextOverlay } = useVideoProject();

    const [selectedCategory, setSelectedCategory] = useState<GraphicCategory>('cta');
    const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

    const categories = getCategories();
    const graphics = getGraphicsByCategory(selectedCategory);

    /**
     * Add graphic to timeline as text overlay.
     * In production, motion graphics would have their own track/layer.
     */
    const handleAddGraphic = useCallback((graphic: MotionGraphic) => {
        const instance = createGraphicInstance(graphic.id, 0);
        if (!instance) return;

        // Use text overlay as temporary storage for motion graphics
        // In production, this would have a dedicated overlay layer
        addTextOverlay({
            text: graphic.name,
            startFrame: instance.startFrame,
            durationFrames: instance.endFrame - instance.startFrame,
            position: instance.position,
            style: {
                fontSize: 24,
                fontFamily: 'Inter, sans-serif',
                color: '#ffffff',
                backgroundColor: 'rgba(0,0,0,0.5)',
                fontWeight: 'bold',
            },
            animation: 'fade',
        });

        logger.debug({ event: 'motion-graphic-added', graphicId: graphic.id, instance });

        setAddedIds(prev => new Set([...prev, graphic.id]));
        setTimeout(() => {
            setAddedIds(prev => {
                const next = new Set(prev);
                next.delete(graphic.id);
                return next;
            });
        }, 2000);
    }, [addTextOverlay]);

    return (
        <div style={containerStyle}>
            {/* Info header */}
            <div style={infoStyle}>
                <Sparkles size={14} style={{ color: '#a855f7' }} />
                <span>Add animated overlays to your video</span>
            </div>

            {/* Category tabs */}
            <div style={categoryTabsStyle}>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                            ...categoryTabStyle,
                            borderColor: selectedCategory === cat.id
                                ? '#a855f7'
                                : 'transparent',
                            color: selectedCategory === cat.id
                                ? '#fff'
                                : 'rgba(255,255,255,0.6)',
                        }}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Graphics grid */}
            <div style={graphicsGridStyle}>
                {graphics.map(graphic => (
                    <GraphicCard
                        key={graphic.id}
                        graphic={graphic}
                        isAdded={addedIds.has(graphic.id)}
                        onAdd={() => handleAddGraphic(graphic)}
                    />
                ))}
            </div>

            {graphics.length === 0 && (
                <p style={emptyStyle}>No graphics in this category</p>
            )}
        </div>
    );
};

// ============================================================================
// GRAPHIC CARD
// ============================================================================

interface GraphicCardProps {
    graphic: MotionGraphic;
    isAdded: boolean;
    onAdd: () => void;
}

const GraphicCard: React.FC<GraphicCardProps> = ({ graphic, isAdded, onAdd }) => {
    return (
        <div style={graphicCardStyle}>
            {/* Preview */}
            <div style={graphicPreviewStyle}>
                <span style={{ fontSize: 28 }}>{graphic.thumbnail}</span>
            </div>

            {/* Info */}
            <div style={graphicInfoStyle}>
                <span style={graphicNameStyle}>{graphic.name}</span>
                <span style={graphicDurationStyle}>{graphic.duration}s</span>
            </div>

            {/* Add button */}
            <button
                onClick={onAdd}
                style={{
                    ...addButtonStyle,
                    backgroundColor: isAdded ? '#10b981' : '#a855f7',
                }}
            >
                {isAdded ? (
                    <>
                        <Check size={12} />
                        Added
                    </>
                ) : (
                    <>
                        <Plus size={12} />
                        Add
                    </>
                )}
            </button>
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

const infoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
};

const categoryTabsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    overflowX: 'auto',
    paddingBottom: 4,
};

const categoryTabStyle: React.CSSProperties = {
    padding: '6px 10px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
};

const graphicsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
};

const graphicCardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
};

const graphicPreviewStyle: React.CSSProperties = {
    width: '100%',
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const graphicInfoStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
};

const graphicNameStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#fff',
    fontWeight: 500,
};

const graphicDurationStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
};

const addButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '6px 10px',
    backgroundColor: '#a855f7',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
};

const emptyStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    padding: 20,
};
