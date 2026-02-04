/**
 * Video Editor Header
 * Top navigation with project name, aspect ratio selector, and export button.
 */

'use client';

import React from 'react';
import { Film, Download, LayoutGrid } from 'lucide-react';
import { ASPECT_RATIOS } from '@/remotion/index';
import {
    headerStyle,
    selectStyle,
    iconButtonStyle,
    exportButtonStyle,
} from './styles';

type AspectRatioKey = keyof typeof ASPECT_RATIOS;

interface EditorHeaderProps {
    projectName: string;
    aspectRatio: AspectRatioKey;
    showMediaPicker: boolean;
    onAspectRatioChange: (ratio: AspectRatioKey) => void;
    onToggleMediaPicker: () => void;
    onExportClick: () => void;
}

/**
 * Header bar with project name, aspect ratio, and export controls.
 */
export function EditorHeader({
    projectName,
    aspectRatio,
    showMediaPicker,
    onAspectRatioChange,
    onToggleMediaPicker,
    onExportClick,
}: EditorHeaderProps) {
    return (
        <header style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Film size={24} style={{ color: '#6366f1' }} />
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                    {projectName}
                </h1>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Aspect ratio selector */}
                <select
                    value={aspectRatio}
                    onChange={(e) => onAspectRatioChange(e.target.value as AspectRatioKey)}
                    style={selectStyle}
                >
                    {Object.entries(ASPECT_RATIOS).map(([key, value]) => (
                        <option key={key} value={key} style={{ color: '#1a1a1a', backgroundColor: '#fff' }}>
                            {value.label}
                        </option>
                    ))}
                </select>

                {/* Toggle media picker */}
                <button
                    onClick={onToggleMediaPicker}
                    style={{
                        ...iconButtonStyle,
                        backgroundColor: showMediaPicker
                            ? 'rgba(99, 102, 241, 0.3)'
                            : 'rgba(255,255,255,0.05)',
                    }}
                    title="Toggle media panel"
                >
                    <LayoutGrid size={16} />
                </button>

                {/* Export button */}
                <button onClick={onExportClick} style={exportButtonStyle}>
                    <Download size={16} />
                    Export
                </button>
            </div>
        </header>
    );
}
