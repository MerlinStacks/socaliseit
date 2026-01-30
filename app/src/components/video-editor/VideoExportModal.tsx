'use client';

/**
 * VideoExportModal Component
 * Export settings dialog for rendering final video output.
 * 
 * Why modal: Export is a one-time action with multiple options.
 * Modal pattern keeps the main editor uncluttered.
 */
import React, { useState, useCallback } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { ASPECT_RATIOS } from '@/remotion/index';

export interface ExportSettings {
    format: 'mp4' | 'webm' | 'gif';
    quality: 'high' | 'medium' | 'low';
    aspectRatio: keyof typeof ASPECT_RATIOS;
}

export interface VideoExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (settings: ExportSettings) => Promise<void>;
    compositionId: string;
    inputProps: Record<string, unknown>;
    durationInSeconds: number;
}

const FORMAT_OPTIONS = [
    { value: 'mp4', label: 'MP4 (H.264)', description: 'Best compatibility' },
    { value: 'webm', label: 'WebM (VP9)', description: 'Smaller file size' },
    { value: 'gif', label: 'GIF', description: 'For short clips' },
] as const;

const QUALITY_OPTIONS = [
    { value: 'high', label: 'High', crf: 18, description: '1080p, best quality' },
    { value: 'medium', label: 'Medium', crf: 23, description: '720p, balanced' },
    { value: 'low', label: 'Low', crf: 28, description: '480p, fast upload' },
] as const;

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
    isOpen,
    onClose,
    onExport,
    compositionId,
    durationInSeconds,
}) => {
    const [settings, setSettings] = useState<ExportSettings>({
        format: 'mp4',
        quality: 'high',
        aspectRatio: 'SQUARE',
    });
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        setError(null);

        try {
            await onExport(settings);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setIsExporting(false);
        }
    }, [onExport, settings, onClose]);

    if (!isOpen) return null;

    const dimensions = ASPECT_RATIOS[settings.aspectRatio];
    const estimatedSize = calculateEstimatedSize(durationInSeconds, settings.quality);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(8px)',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#1a1a2e',
                    borderRadius: 16,
                    padding: 32,
                    width: '100%',
                    maxWidth: 480,
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 24,
                    }}
                >
                    <h2 style={{ margin: 0, color: '#fff', fontSize: 20 }}>
                        Export Video
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.5)',
                            cursor: 'pointer',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Format selection */}
                <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle}>Format</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {FORMAT_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() =>
                                    setSettings({ ...settings, format: option.value })
                                }
                                style={{
                                    ...optionButtonStyle,
                                    ...(settings.format === option.value && selectedStyle),
                                }}
                            >
                                <span style={{ fontWeight: 600 }}>{option.label}</span>
                                <span style={{ fontSize: 12, opacity: 0.7 }}>
                                    {option.description}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quality selection */}
                <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle}>Quality</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {QUALITY_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() =>
                                    setSettings({ ...settings, quality: option.value })
                                }
                                style={{
                                    ...optionButtonStyle,
                                    ...(settings.quality === option.value && selectedStyle),
                                }}
                            >
                                <span style={{ fontWeight: 600 }}>{option.label}</span>
                                <span style={{ fontSize: 12, opacity: 0.7 }}>
                                    {option.description}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Aspect ratio selection */}
                <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle}>Aspect Ratio</label>
                    <select
                        value={settings.aspectRatio}
                        onChange={(e) =>
                            setSettings({
                                ...settings,
                                aspectRatio: e.target.value as keyof typeof ASPECT_RATIOS,
                            })
                        }
                        style={selectStyle}
                    >
                        {Object.entries(ASPECT_RATIOS).map(([key, value]) => (
                            <option key={key} value={key}>
                                {value.label} ({value.width}×{value.height})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Summary */}
                <div
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 24,
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 12,
                            fontSize: 14,
                        }}
                    >
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Composition</div>
                        <div style={{ color: '#fff' }}>{compositionId}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Resolution</div>
                        <div style={{ color: '#fff' }}>
                            {dimensions.width}×{dimensions.height}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Duration</div>
                        <div style={{ color: '#fff' }}>{durationInSeconds}s</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Est. Size</div>
                        <div style={{ color: '#fff' }}>{estimatedSize}</div>
                    </div>
                </div>

                {/* Error message */}
                {error && (
                    <div
                        style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: '#ef4444',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 16,
                            fontSize: 14,
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Export button */}
                <button
                    onClick={handleExport}
                    disabled={isExporting}
                    style={{
                        width: '100%',
                        padding: 16,
                        backgroundColor: isExporting ? '#4a4a6a' : '#6366f1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: isExporting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                >
                    {isExporting ? (
                        <>
                            <Loader2 size={20} className="animate-spin" />
                            Rendering...
                        </>
                    ) : (
                        <>
                            <Download size={20} />
                            Export Video
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

/**
 * Estimate file size based on duration and quality setting
 */
function calculateEstimatedSize(
    durationInSeconds: number,
    quality: 'high' | 'medium' | 'low'
): string {
    const bitrateKbps = { high: 8000, medium: 4000, low: 2000 }[quality];
    const sizeBytes = (bitrateKbps * durationInSeconds * 1000) / 8;

    if (sizeBytes > 1024 * 1024) {
        return `~${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `~${(sizeBytes / 1024).toFixed(0)} KB`;
}

const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 8,
};

const optionButtonStyle: React.CSSProperties = {
    flex: 1,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.2s',
};

const selectedStyle: React.CSSProperties = {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
};

const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
};
