'use client';

/**
 * Template Gallery Panel
 * Browse and apply caption templates in the composer.
 *
 * Why: Provides quick access to reusable templates,
 * reducing content creation time.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    BookTemplate,
    Search,
    Plus,
    Star,
    Trash2,
    Copy,
    Tag,
    X,
    Check,
    Loader2,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/use-workspace';
import { type Platform } from '@/lib/platform-config';

// ============================================================================
// TYPES
// ============================================================================

interface CaptionTemplate {
    id: string;
    name: string;
    caption: string;
    hashtags: string[];
    category?: string;
    thumbnailUrl?: string;
    platforms: Platform[];
    usageCount: number;
}

interface TemplateGalleryPanelProps {
    onSelectTemplate: (caption: string, hashtags: string[]) => void;
    currentCaption?: string;
    selectedPlatforms: Platform[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TemplateGalleryPanel({
    onSelectTemplate,
    currentCaption,
    selectedPlatforms,
}: TemplateGalleryPanelProps) {
    const { organization } = useWorkspace();
    const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
    const [filteredTemplates, setFilteredTemplates] = useState<CaptionTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveCategory, setSaveCategory] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Fetch templates
    useEffect(() => {
        async function fetchTemplates() {
            if (!organization?.id) return;

            try {
                const response = await fetch(
                    `/api/caption-templates?organizationId=${organization.id}`
                );
                if (response.ok) {
                    const data = await response.json();
                    setTemplates(data.templates || []);
                    setFilteredTemplates(data.templates || []);
                }
            } catch {
                // Ignore errors
            } finally {
                setIsLoading(false);
            }
        }

        fetchTemplates();
    }, [organization?.id]);

    // Filter templates
    useEffect(() => {
        let filtered = templates;

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (t) =>
                    t.name.toLowerCase().includes(query) ||
                    t.caption.toLowerCase().includes(query) ||
                    t.hashtags.some((h) => h.toLowerCase().includes(query))
            );
        }

        // Category filter
        if (selectedCategory) {
            filtered = filtered.filter((t) => t.category === selectedCategory);
        }

        // Platform filter - show templates that match any selected platform or have no platforms
        if (selectedPlatforms.length > 0) {
            filtered = filtered.filter(
                (t) =>
                    t.platforms.length === 0 ||
                    t.platforms.some((p) => selectedPlatforms.includes(p))
            );
        }

        setFilteredTemplates(filtered);
    }, [templates, searchQuery, selectedCategory, selectedPlatforms]);

    // Get unique categories
    const categories = Array.from(
        new Set(templates.map((t) => t.category).filter(Boolean))
    ) as string[];

    const handleSelectTemplate = useCallback(
        (template: CaptionTemplate) => {
            onSelectTemplate(template.caption, template.hashtags);

            // Track usage
            fetch('/api/caption-templates/usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId: template.id }),
            }).catch(() => {
                // Ignore errors
            });
        },
        [onSelectTemplate]
    );

    const handleSaveAsTemplate = useCallback(async () => {
        if (!organization?.id || !currentCaption || !saveName) return;

        setIsSaving(true);
        try {
            // Extract hashtags from caption
            const hashtagRegex = /#[\w]+/g;
            const hashtags = currentCaption.match(hashtagRegex)?.map((h) => h.slice(1)) ?? [];

            const response = await fetch('/api/caption-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organizationId: organization.id,
                    name: saveName,
                    caption: currentCaption,
                    hashtags,
                    category: saveCategory || null,
                    platforms: selectedPlatforms,
                }),
            });

            if (response.ok) {
                const newTemplate = await response.json();
                setTemplates((prev) => [newTemplate, ...prev]);
                setShowSaveModal(false);
                setSaveName('');
                setSaveCategory('');
            }
        } finally {
            setIsSaving(false);
        }
    }, [organization?.id, currentCaption, saveName, saveCategory, selectedPlatforms]);

    const handleDeleteTemplate = useCallback(async (templateId: string) => {
        const response = await fetch(`/api/caption-templates/${templateId}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        }
    }, []);

    if (isLoading) {
        return (
            <div style={containerStyle}>
                <div style={loadingStyle}>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Loading templates...</span>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <div style={headerLeftStyle}>
                    <BookTemplate size={18} />
                    <span style={titleStyle}>Template Library</span>
                    <span style={countBadgeStyle}>{templates.length}</span>
                </div>
                {currentCaption && currentCaption.length > 20 && (
                    <button
                        onClick={() => setShowSaveModal(true)}
                        style={saveButtonStyle}
                        type="button"
                    >
                        <Plus size={14} />
                        Save Current
                    </button>
                )}
            </div>

            {/* Search & Filters */}
            <div style={filtersStyle}>
                <div style={searchWrapperStyle}>
                    <Search size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search templates..."
                        style={searchInputStyle}
                    />
                </div>

                {categories.length > 0 && (
                    <div style={categoryPillsStyle}>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            style={{
                                ...categoryPillStyle,
                                ...(selectedCategory === null ? categoryPillActiveStyle : {}),
                            }}
                            type="button"
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() =>
                                    setSelectedCategory(cat === selectedCategory ? null : cat)
                                }
                                style={{
                                    ...categoryPillStyle,
                                    ...(selectedCategory === cat ? categoryPillActiveStyle : {}),
                                }}
                                type="button"
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Template Grid */}
            <div style={gridStyle}>
                {filteredTemplates.length === 0 ? (
                    <div style={emptyStateStyle}>
                        <BookTemplate size={24} style={{ opacity: 0.3 }} />
                        <p>No templates found</p>
                        {currentCaption && (
                            <button
                                onClick={() => setShowSaveModal(true)}
                                style={createFirstButtonStyle}
                                type="button"
                            >
                                <Plus size={14} />
                                Create your first template
                            </button>
                        )}
                    </div>
                ) : (
                    filteredTemplates.map((template) => (
                        <div key={template.id} style={templateCardStyle}>
                            <div style={templateHeaderStyle}>
                                <span style={templateNameStyle}>{template.name}</span>
                                <div style={templateActionsStyle}>
                                    <button
                                        onClick={() => handleDeleteTemplate(template.id)}
                                        style={iconButtonStyle}
                                        title="Delete"
                                        type="button"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>

                            <p style={templateCaptionStyle}>
                                {template.caption.substring(0, 100)}
                                {template.caption.length > 100 ? '...' : ''}
                            </p>

                            {template.hashtags.length > 0 && (
                                <div style={hashtagsStyle}>
                                    {template.hashtags.slice(0, 3).map((tag) => (
                                        <span key={tag} style={hashtagStyle}>
                                            #{tag}
                                        </span>
                                    ))}
                                    {template.hashtags.length > 3 && (
                                        <span style={moreHashtagsStyle}>
                                            +{template.hashtags.length - 3}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div style={templateFooterStyle}>
                                {template.category && (
                                    <span style={categoryTagStyle}>
                                        <Tag size={10} />
                                        {template.category}
                                    </span>
                                )}
                                <span style={usageCountStyle}>
                                    Used {template.usageCount}×
                                </span>
                                <button
                                    onClick={() => handleSelectTemplate(template)}
                                    style={useButtonStyle}
                                    type="button"
                                >
                                    <Copy size={12} />
                                    Use
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div style={modalOverlayStyle} onClick={() => setShowSaveModal(false)}>
                    <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                        <div style={modalHeaderStyle}>
                            <h3 style={modalTitleStyle}>Save as Template</h3>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                style={closeButtonStyle}
                                type="button"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div style={modalBodyStyle}>
                            <div style={inputGroupStyle}>
                                <label style={inputLabelStyle}>Template Name *</label>
                                <input
                                    type="text"
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    placeholder="e.g., Product Launch Announcement"
                                    style={modalInputStyle}
                                />
                            </div>

                            <div style={inputGroupStyle}>
                                <label style={inputLabelStyle}>Category</label>
                                <input
                                    type="text"
                                    value={saveCategory}
                                    onChange={(e) => setSaveCategory(e.target.value)}
                                    placeholder="e.g., Promotional, Educational, CTA"
                                    style={modalInputStyle}
                                    list="category-suggestions"
                                />
                                <datalist id="category-suggestions">
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                            </div>

                            <div style={previewBoxStyle}>
                                <label style={inputLabelStyle}>Caption Preview</label>
                                <p style={previewTextStyle}>
                                    {currentCaption?.substring(0, 200)}
                                    {(currentCaption?.length ?? 0) > 200 ? '...' : ''}
                                </p>
                            </div>
                        </div>

                        <div style={modalFooterStyle}>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                style={cancelButtonStyle}
                                type="button"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAsTemplate}
                                disabled={!saveName || isSaving}
                                style={confirmButtonStyle}
                                type="button"
                            >
                                {isSaving ? (
                                    <Loader2 className="animate-spin" size={14} />
                                ) : (
                                    <Check size={14} />
                                )}
                                Save Template
                            </button>
                        </div>
                    </div>
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
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.08)',
};

const loadingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    color: 'rgba(255, 255, 255, 0.5)',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

const headerLeftStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#fff',
};

const titleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
};

const countBadgeStyle: React.CSSProperties = {
    fontSize: 11,
    padding: '2px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
};

const saveButtonStyle: React.CSSProperties = {
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

const filtersStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const searchWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 6,
};

const searchInputStyle: React.CSSProperties = {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    outline: 'none',
};

const categoryPillsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

const categoryPillStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
};

const categoryPillActiveStyle: React.CSSProperties = {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
    color: '#8b8efc',
};

const gridStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 300,
    overflowY: 'auto',
};

const emptyStateStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 24,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
};

const createFirstButtonStyle: React.CSSProperties = {
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

const templateCardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 6,
    border: '1px solid rgba(255, 255, 255, 0.06)',
};

const templateHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
};

const templateNameStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: '#fff',
};

const templateActionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
};

const iconButtonStyle: React.CSSProperties = {
    padding: 4,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.3)',
    cursor: 'pointer',
};

const templateCaptionStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.4,
};

const hashtagsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
};

const hashtagStyle: React.CSSProperties = {
    fontSize: 10,
    padding: '2px 6px',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    color: '#8b8efc',
    borderRadius: 4,
};

const moreHashtagsStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
};

const templateFooterStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
};

const categoryTagStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
};

const usageCountStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
};

const useButtonStyle: React.CSSProperties = {
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
const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
};

const modalTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    color: '#fff',
};

const closeButtonStyle: React.CSSProperties = {
    padding: 4,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
};

const modalBodyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
};

const inputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const inputLabelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
};

const modalInputStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    outline: 'none',
};

const previewBoxStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const previewTextStyle: React.CSSProperties = {
    margin: 0,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 6,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.4,
};

const modalFooterStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
};

const cancelButtonStyle: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 13,
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
};

const confirmButtonStyle: React.CSSProperties = {
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

export default TemplateGalleryPanel;
