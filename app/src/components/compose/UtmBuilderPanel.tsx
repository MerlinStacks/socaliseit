'use client';

/**
 * UTM Builder Panel
 * Composer panel for adding UTM tracking parameters to links.
 *
 * Why: Enables users to add campaign tracking to links directly
 * from the composer without manual URL construction.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, Tag, Bookmark, Plus, Trash2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useWorkspace } from '@/hooks/use-workspace';
import {
    buildUtmUrl,
    extractUrlsFromCaption,
    type UtmParams,
    type UtmTemplate,
} from '@/lib/utm-builder';

// ============================================================================
// TYPES
// ============================================================================

interface UtmBuilderPanelProps {
    caption: string;
    onApplyUtm: (updatedCaption: string) => void;
    selectedPlatform?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function UtmBuilderPanel({
    caption,
    onApplyUtm,
    selectedPlatform,
}: UtmBuilderPanelProps) {
    const { organization } = useWorkspace();
    const [templates, setTemplates] = useState<UtmTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [customParams, setCustomParams] = useState<UtmParams>({
        source: selectedPlatform?.toLowerCase() ?? 'social',
        medium: 'social',
        campaign: '',
        content: '',
        term: '',
    });

    // Detect URLs in caption
    const detectedUrls = extractUrlsFromCaption(caption);
    const hasUrls = detectedUrls.length > 0;

    // Fetch templates
    useEffect(() => {
        async function fetchTemplates() {
            if (!organization?.id) return;

            try {
                const response = await fetch(`/api/utm-templates?organizationId=${organization.id}`);
                if (response.ok) {
                    const data = await response.json();
                    setTemplates(data.templates || []);
                }
            } catch {
                // Ignore errors
            } finally {
                setIsLoading(false);
            }
        }

        fetchTemplates();
    }, [organization?.id]);

    // Update source when platform changes
    useEffect(() => {
        if (selectedPlatform) {
            setCustomParams((prev) => ({
                ...prev,
                source: selectedPlatform.toLowerCase(),
            }));
        }
    }, [selectedPlatform]);

    const handleSelectTemplate = useCallback((template: UtmTemplate) => {
        setSelectedTemplateId(template.id);
        setCustomParams({
            source: template.source,
            medium: template.medium,
            campaign: template.campaign ?? '',
            content: template.content ?? '',
            term: template.term ?? '',
        });
    }, []);

    const handleApply = useCallback(() => {
        if (!hasUrls) return;

        let updatedCaption = caption;
        detectedUrls.forEach((url) => {
            // Skip if already has UTM params
            if (url.includes('utm_source')) return;

            const taggedUrl = buildUtmUrl(url, customParams);
            updatedCaption = updatedCaption.replace(url, taggedUrl);
        });

        onApplyUtm(updatedCaption);

        // Track template usage
        if (selectedTemplateId) {
            fetch('/api/utm-templates/usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId: selectedTemplateId }),
            }).catch(() => {
                // Ignore errors
            });
        }
    }, [caption, customParams, detectedUrls, hasUrls, onApplyUtm, selectedTemplateId]);

    const handleInputChange = (field: keyof UtmParams, value: string) => {
        setSelectedTemplateId(null); // Clear template selection
        setCustomParams((prev) => ({ ...prev, [field]: value }));
    };

    // Preview URL
    const previewUrl = hasUrls
        ? buildUtmUrl(detectedUrls[0], customParams)
        : 'https://example.com/?utm_source=...'
        ;

    if (!hasUrls) {
        return (
            <div style={containerStyle}>
                <div style={headerStyle}>
                    <Link size={16} />
                    <span style={titleStyle}>UTM Builder</span>
                </div>
                <p style={noUrlsStyle}>
                    Add a link to your caption to enable UTM tracking
                </p>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={headerButtonStyle}
                type="button"
            >
                <div style={headerLeftStyle}>
                    <Link size={16} />
                    <span style={titleStyle}>UTM Builder</span>
                    <span style={urlCountStyle}>{detectedUrls.length} URL{detectedUrls.length > 1 ? 's' : ''}</span>
                </div>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isExpanded && (
                <div style={contentStyle}>
                    {/* Templates */}
                    {templates.length > 0 && (
                        <div style={sectionStyle}>
                            <label style={labelStyle}>Quick Templates</label>
                            <div style={templatesGridStyle}>
                                {templates.slice(0, 6).map((template) => (
                                    <button
                                        key={template.id}
                                        onClick={() => handleSelectTemplate(template)}
                                        style={{
                                            ...templateButtonStyle,
                                            ...(selectedTemplateId === template.id ? templateButtonActiveStyle : {}),
                                        }}
                                        type="button"
                                    >
                                        <Bookmark size={12} />
                                        <span>{template.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Custom Parameters */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>UTM Parameters</label>
                        <div style={inputsGridStyle}>
                            <div style={inputGroupStyle}>
                                <label style={inputLabelStyle}>Source *</label>
                                <input
                                    type="text"
                                    value={customParams.source}
                                    onChange={(e) => handleInputChange('source', e.target.value)}
                                    placeholder="instagram, facebook..."
                                    style={inputStyle}
                                />
                            </div>
                            <div style={inputGroupStyle}>
                                <label style={inputLabelStyle}>Medium *</label>
                                <input
                                    type="text"
                                    value={customParams.medium}
                                    onChange={(e) => handleInputChange('medium', e.target.value)}
                                    placeholder="social, email..."
                                    style={inputStyle}
                                />
                            </div>
                            <div style={inputGroupStyle}>
                                <label style={inputLabelStyle}>Campaign</label>
                                <input
                                    type="text"
                                    value={customParams.campaign ?? ''}
                                    onChange={(e) => handleInputChange('campaign', e.target.value)}
                                    placeholder="spring_sale..."
                                    style={inputStyle}
                                />
                            </div>
                            <div style={inputGroupStyle}>
                                <label style={inputLabelStyle}>Content</label>
                                <input
                                    type="text"
                                    value={customParams.content ?? ''}
                                    onChange={(e) => handleInputChange('content', e.target.value)}
                                    placeholder="hero_image..."
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div style={sectionStyle}>
                        <label style={labelStyle}>Preview</label>
                        <div style={previewStyle}>
                            <code style={previewCodeStyle}>{previewUrl}</code>
                        </div>
                    </div>

                    {/* Apply Button */}
                    <button
                        onClick={handleApply}
                        disabled={!customParams.source || !customParams.medium}
                        style={applyButtonStyle}
                        type="button"
                    >
                        <Check size={16} />
                        Apply UTM to {detectedUrls.length} Link{detectedUrls.length > 1 ? 's' : ''}
                    </button>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    color: '#fff',
};

const headerButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
};

const headerLeftStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};

const titleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
};

const urlCountStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '2px 6px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#8b8efc',
    borderRadius: 10,
};

const noUrlsStyle: React.CSSProperties = {
    padding: '0 12px 12px',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    margin: 0,
};

const contentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '0 12px 12px',
};

const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
};

const templatesGridStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

const templateButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
    transition: 'all 0.15s',
};

const templateButtonActiveStyle: React.CSSProperties = {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
    color: '#8b8efc',
};

const inputsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
};

const inputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
};

const inputLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
};

const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    outline: 'none',
};

const previewStyle: React.CSSProperties = {
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
    overflow: 'auto',
};

const previewCodeStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#10b981',
    wordBreak: 'break-all',
};

const applyButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
};

export default UtmBuilderPanel;
