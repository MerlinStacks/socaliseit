'use client';

/**
 * Template Gallery Panel
 * Browse and apply caption templates in the composer.
 *
 * Why: Provides quick access to reusable templates,
 * reducing content creation time.
 * 
 * Decomposed for 200-line standard compliance - styles in TemplateGalleryPanel.styles.ts
 */

import { useState, useEffect, useCallback } from 'react';
import {
    BookTemplate,
    Search,
    Plus,
    Trash2,
    Copy,
    Tag,
    X,
    Check,
    Loader2,
} from 'lucide-react';
import { useOrganization } from '@/hooks/use-organization';
import { type Platform } from '@/lib/platform-config';
import * as styles from './TemplateGalleryPanel.styles';

// Types
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

export function TemplateGalleryPanel({
    onSelectTemplate,
    currentCaption,
    selectedPlatforms,
}: TemplateGalleryPanelProps) {
    const { organization } = useOrganization();
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
                const response = await fetch(`/api/caption-templates?organizationId=${organization.id}`);
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
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (t) => t.name.toLowerCase().includes(query) ||
                    t.caption.toLowerCase().includes(query) ||
                    t.hashtags.some((h) => h.toLowerCase().includes(query))
            );
        }
        if (selectedCategory) {
            filtered = filtered.filter((t) => t.category === selectedCategory);
        }
        if (selectedPlatforms.length > 0) {
            filtered = filtered.filter(
                (t) => t.platforms.length === 0 || t.platforms.some((p) => selectedPlatforms.includes(p))
            );
        }
        setFilteredTemplates(filtered);
    }, [templates, searchQuery, selectedCategory, selectedPlatforms]);

    const categories = Array.from(new Set(templates.map((t) => t.category).filter(Boolean))) as string[];

    const handleSelectTemplate = useCallback((template: CaptionTemplate) => {
        onSelectTemplate(template.caption, template.hashtags);
        fetch('/api/caption-templates/usage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId: template.id }),
        }).catch(() => { /* Ignore usage tracking errors */ });
    }, [onSelectTemplate]);

    const handleSaveAsTemplate = useCallback(async () => {
        if (!organization?.id || !currentCaption || !saveName) return;
        setIsSaving(true);
        try {
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
        const response = await fetch(`/api/caption-templates/${templateId}`, { method: 'DELETE' });
        if (response.ok) {
            setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        }
    }, []);

    if (isLoading) {
        return (
            <div style={styles.containerStyle}>
                <div style={styles.loadingStyle}>
                    <Loader2 className="animate-spin" size={20} />
                    <span>Loading templates...</span>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.containerStyle}>
            {/* Header */}
            <div style={styles.headerStyle}>
                <div style={styles.headerLeftStyle}>
                    <BookTemplate size={18} />
                    <span style={styles.titleStyle}>Template Library</span>
                    <span style={styles.countBadgeStyle}>{templates.length}</span>
                </div>
                {currentCaption && currentCaption.length > 20 && (
                    <button onClick={() => setShowSaveModal(true)} style={styles.saveButtonStyle} type="button">
                        <Plus size={14} />
                        Save Current
                    </button>
                )}
            </div>

            {/* Search & Filters */}
            <div style={styles.filtersStyle}>
                <div style={styles.searchWrapperStyle}>
                    <Search size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search templates..."
                        style={styles.searchInputStyle}
                    />
                </div>
                {categories.length > 0 && (
                    <div style={styles.categoryPillsStyle}>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            style={{ ...styles.categoryPillStyle, ...(selectedCategory === null ? styles.categoryPillActiveStyle : {}) }}
                            type="button"
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                                style={{ ...styles.categoryPillStyle, ...(selectedCategory === cat ? styles.categoryPillActiveStyle : {}) }}
                                type="button"
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Template Grid */}
            <div style={styles.gridStyle}>
                {filteredTemplates.length === 0 ? (
                    <div style={styles.emptyStateStyle}>
                        <BookTemplate size={24} style={{ opacity: 0.3 }} />
                        <p>No templates found</p>
                        {currentCaption && (
                            <button onClick={() => setShowSaveModal(true)} style={styles.createFirstButtonStyle} type="button">
                                <Plus size={14} />
                                Create your first template
                            </button>
                        )}
                    </div>
                ) : (
                    filteredTemplates.map((template) => (
                        <div key={template.id} style={styles.templateCardStyle}>
                            <div style={styles.templateHeaderStyle}>
                                <span style={styles.templateNameStyle}>{template.name}</span>
                                <div style={styles.templateActionsStyle}>
                                    <button onClick={() => handleDeleteTemplate(template.id)} style={styles.iconButtonStyle} title="Delete" type="button">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                            <p style={styles.templateCaptionStyle}>
                                {template.caption.substring(0, 100)}{template.caption.length > 100 ? '...' : ''}
                            </p>
                            {template.hashtags.length > 0 && (
                                <div style={styles.hashtagsStyle}>
                                    {template.hashtags.slice(0, 3).map((tag) => (
                                        <span key={tag} style={styles.hashtagStyle}>#{tag}</span>
                                    ))}
                                    {template.hashtags.length > 3 && (
                                        <span style={styles.moreHashtagsStyle}>+{template.hashtags.length - 3}</span>
                                    )}
                                </div>
                            )}
                            <div style={styles.templateFooterStyle}>
                                {template.category && (
                                    <span style={styles.categoryTagStyle}><Tag size={10} />{template.category}</span>
                                )}
                                <span style={styles.usageCountStyle}>Used {template.usageCount}×</span>
                                <button onClick={() => handleSelectTemplate(template)} style={styles.useButtonStyle} type="button">
                                    <Copy size={12} />Use
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div style={styles.modalOverlayStyle} onClick={() => setShowSaveModal(false)}>
                    <div style={styles.modalStyle} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeaderStyle}>
                            <h3 style={styles.modalTitleStyle}>Save as Template</h3>
                            <button onClick={() => setShowSaveModal(false)} style={styles.closeButtonStyle} type="button">
                                <X size={16} />
                            </button>
                        </div>
                        <div style={styles.modalBodyStyle}>
                            <div style={styles.inputGroupStyle}>
                                <label style={styles.inputLabelStyle}>Template Name *</label>
                                <input
                                    type="text"
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    placeholder="e.g., Product Launch Announcement"
                                    style={styles.modalInputStyle}
                                />
                            </div>
                            <div style={styles.inputGroupStyle}>
                                <label style={styles.inputLabelStyle}>Category</label>
                                <input
                                    type="text"
                                    value={saveCategory}
                                    onChange={(e) => setSaveCategory(e.target.value)}
                                    placeholder="e.g., Promotional, Educational, CTA"
                                    style={styles.modalInputStyle}
                                    list="category-suggestions"
                                />
                                <datalist id="category-suggestions">
                                    {categories.map((cat) => (<option key={cat} value={cat} />))}
                                </datalist>
                            </div>
                            <div style={styles.previewBoxStyle}>
                                <label style={styles.inputLabelStyle}>Caption Preview</label>
                                <p style={styles.previewTextStyle}>
                                    {currentCaption?.substring(0, 200)}{(currentCaption?.length ?? 0) > 200 ? '...' : ''}
                                </p>
                            </div>
                        </div>
                        <div style={styles.modalFooterStyle}>
                            <button onClick={() => setShowSaveModal(false)} style={styles.cancelButtonStyle} type="button">Cancel</button>
                            <button onClick={handleSaveAsTemplate} disabled={!saveName || isSaving} style={styles.confirmButtonStyle} type="button">
                                {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                                Save Template
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TemplateGalleryPanel;
