import React from 'react';
import { useVideoProject, TextOverlay } from '@/hooks/useVideoProject';
import { Trash2, Type, AlignLeft, Palette, Wand2 } from 'lucide-react';

export const TextProperties: React.FC = () => {
    const selectedTextId = useVideoProject((state) => state.selectedTextId);
    const textOverlays = useVideoProject((state) => state.project.textOverlays);
    const updateTextOverlay = useVideoProject((state) => state.updateTextOverlay);
    const removeTextOverlay = useVideoProject((state) => state.removeTextOverlay);

    const selectedText = textOverlays.find((t) => t.id === selectedTextId);

    if (!selectedText) return null;

    const handleChange = (updates: Partial<TextOverlay> | Partial<TextOverlay['style']>) => {
        // Handle nested style updates
        if ('fontSize' in updates || 'color' in updates || 'backgroundColor' in updates) {
            updateTextOverlay(selectedText.id, {
                style: { ...selectedText.style, ...updates } as TextOverlay['style']
            });
        } else {
            updateTextOverlay(selectedText.id, updates as Partial<TextOverlay>);
        }
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <Type size={16} style={{ color: '#6366f1' }} />
                <span style={headerTitleStyle}>Text Properties</span>
            </div>

            <div style={contentStyle}>
                {/* Content */}
                <div style={sectionStyle}>
                    <label style={labelStyle}>Content</label>
                    <textarea
                        value={selectedText.text}
                        onChange={(e) => handleChange({ text: e.target.value })}
                        style={textareaStyle}
                        rows={3}
                    />
                </div>

                {/* Appearance */}
                <div style={sectionStyle}>
                    <div style={rowStyle}>
                        <AlignLeft size={14} style={{ marginRight: 8, color: 'rgba(255,255,255,0.6)' }} />
                        <span style={subHeaderStyle}>Appearance</span>
                    </div>

                    <div style={controlGroupStyle}>
                        <label style={labelStyle}>Font Size</label>
                        <input
                            type="range"
                            min="12"
                            max="120"
                            value={selectedText.style.fontSize}
                            onChange={(e) => handleChange({ fontSize: parseInt(e.target.value) })}
                            style={rangeStyle}
                        />
                        <span style={valueStyle}>{selectedText.style.fontSize}px</span>
                    </div>

                    <div style={controlGroupStyle}>
                        <label style={labelStyle}>Weight</label>
                        <div style={toggleGroupStyle}>
                            <button
                                style={{
                                    ...toggleButtonStyle,
                                    backgroundColor: selectedText.style.fontWeight === 'normal' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                                    borderColor: selectedText.style.fontWeight === 'normal' ? '#6366f1' : 'rgba(255,255,255,0.2)'
                                }}
                                onClick={() => handleChange({ style: { ...selectedText.style, fontWeight: 'normal' } })}
                            >
                                Normal
                            </button>
                            <button
                                style={{
                                    ...toggleButtonStyle,
                                    backgroundColor: selectedText.style.fontWeight === 'bold' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                                    borderColor: selectedText.style.fontWeight === 'bold' ? '#6366f1' : 'rgba(255,255,255,0.2)'
                                }}
                                onClick={() => handleChange({ style: { ...selectedText.style, fontWeight: 'bold' } })}
                            >
                                Bold
                            </button>
                        </div>
                    </div>

                    <div style={controlGroupStyle}>
                        <label style={labelStyle}>Color</label>
                        <div style={colorContainerStyle}>
                            <input
                                type="color"
                                value={selectedText.style.color}
                                onChange={(e) => handleChange({ color: e.target.value })}
                                style={colorInputStyle}
                            />
                            <span style={valueStyle}>{selectedText.style.color}</span>
                        </div>
                    </div>

                    <div style={controlGroupStyle}>
                        <label style={labelStyle}>Background</label>
                        <div style={colorContainerStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                <input
                                    type="checkbox"
                                    checked={!!selectedText.style.backgroundColor}
                                    onChange={(e) => handleChange({
                                        style: {
                                            ...selectedText.style,
                                            backgroundColor: e.target.checked ? '#000000' : null
                                        }
                                    })}
                                    style={{ marginRight: 8 }}
                                />
                                <span style={valueStyle}>Enable</span>
                            </div>
                            {selectedText.style.backgroundColor && (
                                <input
                                    type="color"
                                    value={selectedText.style.backgroundColor}
                                    onChange={(e) => handleChange({ style: { ...selectedText.style, backgroundColor: e.target.value } })}
                                    style={colorInputStyle}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Animation */}
                <div style={sectionStyle}>
                    <div style={rowStyle}>
                        <Wand2 size={14} style={{ marginRight: 8, color: 'rgba(255,255,255,0.6)' }} />
                        <span style={subHeaderStyle}>Animation</span>
                    </div>

                    <div style={gridStyle}>
                        {(['none', 'fade', 'slide', 'typewriter'] as const).map(anim => (
                            <button
                                key={anim}
                                onClick={() => handleChange({ animation: anim })}
                                style={{
                                    ...animButtonStyle,
                                    backgroundColor: selectedText.animation === anim ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                                    borderColor: selectedText.animation === anim ? '#6366f1' : 'rgba(255,255,255,0.1)',
                                }}
                            >
                                {anim.charAt(0).toUpperCase() + anim.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div style={actionsStyle}>
                    <button
                        onClick={() => removeTextOverlay(selectedText.id)}
                        style={deleteButtonStyle}
                    >
                        <Trash2 size={16} />
                        Delete Text
                    </button>
                </div>
            </div>
        </div>
    );
};

// Styles
const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    overflowY: 'auto',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const headerTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
};

const contentStyle: React.CSSProperties = {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
};

const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};

const subHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
};

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 4,
};

const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
    display: 'block',
};

const textareaStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    resize: 'vertical',
    outline: 'none',
    minHeight: 80,
    fontFamily: 'inherit',
};

const controlGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const rangeStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#6366f1',
};

const valueStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'monospace',
};

const toggleGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
};

const toggleButtonStyle: React.CSSProperties = {
    flex: 1,
    padding: '6px 12px',
    border: '1px solid',
    borderRadius: 4,
    fontSize: 12,
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
};

const colorContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
};

const colorInputStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    padding: 0,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: 'transparent',
};

const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
};

const animButtonStyle: React.CSSProperties = {
    padding: '8px',
    border: '1px solid',
    borderRadius: 6,
    fontSize: 12,
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
};

const actionsStyle: React.CSSProperties = {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 20,
    marginTop: 8,
};

const deleteButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '10px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
};
