/**
 * Command Palette Component
 * Quick actions via keyboard shortcut (Cmd/Ctrl + K)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Search, Home, Calendar, Edit3, Image, BarChart3, Eye,
    Settings, Plus, Sparkles, Bell, User, LogOut,
    Command, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
    id: string;
    label: string;
    description?: string;
    icon: React.ElementType;
    shortcut?: string;
    action: () => void;
    category: 'navigation' | 'action' | 'settings';
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const commands: CommandItem[] = [
        // Navigation
        { id: 'dashboard', label: 'Go to Dashboard', icon: Home, shortcut: 'G D', action: () => router.push('/dashboard'), category: 'navigation' },
        { id: 'calendar', label: 'Go to Calendar', icon: Calendar, shortcut: 'G C', action: () => router.push('/calendar'), category: 'navigation' },
        { id: 'compose', label: 'Go to Compose', icon: Edit3, shortcut: 'G N', action: () => router.push('/compose'), category: 'navigation' },
        { id: 'media', label: 'Go to Media Library', icon: Image, shortcut: 'G M', action: () => router.push('/media'), category: 'navigation' },
        { id: 'analytics', label: 'Go to Analytics', icon: BarChart3, shortcut: 'G A', action: () => router.push('/analytics'), category: 'navigation' },
        { id: 'listening', label: 'Go to Listening', icon: Eye, action: () => router.push('/listening'), category: 'navigation' },
        { id: 'settings', label: 'Go to Settings', icon: Settings, shortcut: 'G S', action: () => router.push('/settings'), category: 'navigation' },

        // Actions
        { id: 'new-post', label: 'Create New Post', icon: Plus, shortcut: 'N', action: () => router.push('/compose'), category: 'action' },
        { id: 'ai-generate', label: 'AI Generate Caption', icon: Sparkles, description: 'Generate caption with AI', action: () => router.push('/compose?ai=true'), category: 'action' },
        { id: 'upload', label: 'Upload Media', icon: Image, shortcut: 'U', action: () => router.push('/media?upload=true'), category: 'action' },

        // Settings
        { id: 'profile', label: 'Your Profile', icon: User, action: () => router.push('/settings?tab=profile'), category: 'settings' },
        { id: 'notifications', label: 'Notification Settings', icon: Bell, action: () => router.push('/settings?tab=notifications'), category: 'settings' },
        { id: 'logout', label: 'Sign Out', icon: LogOut, action: () => console.log('Sign out'), category: 'settings' },
    ];

    const filteredCommands = query
        ? commands.filter(
            (cmd) =>
                cmd.label.toLowerCase().includes(query.toLowerCase()) ||
                cmd.description?.toLowerCase().includes(query.toLowerCase())
        )
        : commands;

    const groupedCommands = {
        navigation: filteredCommands.filter((c) => c.category === 'navigation'),
        action: filteredCommands.filter((c) => c.category === 'action'),
        settings: filteredCommands.filter((c) => c.category === 'settings'),
    };

    const flatCommands = [...groupedCommands.navigation, ...groupedCommands.action, ...groupedCommands.settings];

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex((i) => (i + 1) % flatCommands.length);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex((i) => (i - 1 + flatCommands.length) % flatCommands.length);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (flatCommands[selectedIndex]) {
                        flatCommands[selectedIndex].action();
                        onClose();
                    }
                    break;
                case 'Escape':
                    onClose();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, flatCommands, selectedIndex, onClose]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-xl rounded-xl bg-[var(--bg-secondary)] shadow-2xl">
                {/* Search Input */}
                <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
                    <Search className="h-5 w-5 text-[var(--text-muted)]" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        placeholder="Type a command or search..."
                        className="h-14 flex-1 bg-transparent text-base outline-none"
                    />
                    <kbd className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-muted)]">
                        ESC
                    </kbd>
                </div>

                {/* Commands List */}
                <div className="max-h-80 overflow-y-auto p-2">
                    {groupedCommands.navigation.length > 0 && (
                        <CommandGroup
                            label="Navigation"
                            commands={groupedCommands.navigation}
                            selectedIndex={selectedIndex}
                            baseIndex={0}
                            onSelect={(cmd) => { cmd.action(); onClose(); }}
                        />
                    )}
                    {groupedCommands.action.length > 0 && (
                        <CommandGroup
                            label="Actions"
                            commands={groupedCommands.action}
                            selectedIndex={selectedIndex}
                            baseIndex={groupedCommands.navigation.length}
                            onSelect={(cmd) => { cmd.action(); onClose(); }}
                        />
                    )}
                    {groupedCommands.settings.length > 0 && (
                        <CommandGroup
                            label="Settings"
                            commands={groupedCommands.settings}
                            selectedIndex={selectedIndex}
                            baseIndex={groupedCommands.navigation.length + groupedCommands.action.length}
                            onSelect={(cmd) => { cmd.action(); onClose(); }}
                        />
                    )}
                    {flatCommands.length === 0 && (
                        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                            No commands found
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <kbd className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">↑↓</kbd>
                            to navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">↵</kbd>
                            to select
                        </span>
                    </div>
                    <span className="flex items-center gap-1">
                        <Command className="h-3 w-3" />K to open
                    </span>
                </div>
            </div>
        </div>
    );
}

interface CommandGroupProps {
    label: string;
    commands: CommandItem[];
    selectedIndex: number;
    baseIndex: number;
    onSelect: (cmd: CommandItem) => void;
}

function CommandGroup({ label, commands, selectedIndex, baseIndex, onSelect }: CommandGroupProps) {
    return (
        <div className="mb-2">
            <div className="mb-1 px-2 text-xs font-medium text-[var(--text-muted)]">
                {label}
            </div>
            {commands.map((cmd, i) => {
                const Icon = cmd.icon;
                const isSelected = selectedIndex === baseIndex + i;

                return (
                    <button
                        key={cmd.id}
                        onClick={() => onSelect(cmd)}
                        className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                            isSelected
                                ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        <div className="flex-1">
                            <p className="text-sm font-medium">{cmd.label}</p>
                            {cmd.description && (
                                <p className="text-xs text-[var(--text-muted)]">{cmd.description}</p>
                            )}
                        </div>
                        {cmd.shortcut && (
                            <kbd className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                                {cmd.shortcut}
                            </kbd>
                        )}
                        <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Hook to use command palette
 */
export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen((prev) => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((prev) => !prev),
    };
}
