'use client';

/**
 * Add Platform Dialog
 * Why: Premium glassmorphism design for platform selection
 */

import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PLATFORM_CONFIG } from './platform-config';

interface AddPlatformDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connecting: string | null;
    onSelectPlatform: (platformId: string) => void;
}

export function AddPlatformDialog({
    open,
    onOpenChange,
    connecting,
    onSelectPlatform,
}: AddPlatformDialogProps) {
    const platforms = Object.values(PLATFORM_CONFIG);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md overflow-hidden">
                <DialogHeader className="pb-2">
                    <DialogTitle className="text-xl font-semibold">Connect a Platform</DialogTitle>
                    <DialogDescription className="text-[var(--text-muted)]">
                        Choose a social media platform to connect to your organization.
                    </DialogDescription>
                </DialogHeader>

                {/* Platform Grid with Premium Cards */}
                <div className="grid grid-cols-2 gap-4 py-4">
                    {platforms.map((platform) => {
                        const Icon = platform.icon;
                        const isConnecting = connecting === platform.id;
                        const isDisabled = connecting !== null && !isConnecting;

                        return (
                            <button
                                key={platform.id}
                                onClick={() => onSelectPlatform(platform.id)}
                                disabled={connecting !== null}
                                className={`
                                    group relative flex flex-col items-center gap-3 p-6
                                    rounded-2xl border border-white/10
                                    bg-white/5 dark:bg-slate-900/40
                                    backdrop-blur-sm
                                    transition-all duration-300 ease-out
                                    hover:scale-105 hover:bg-white/10 dark:hover:bg-slate-800/60
                                    ${platform.hoverGlow}
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                                    focus:outline-none focus:ring-2 focus:ring-white/20
                                `}
                            >
                                {/* Platform Icon with Brand Gradient Background */}
                                <div className={`
                                    flex h-14 w-14 items-center justify-center
                                    rounded-xl text-white
                                    ${platform.iconBg}
                                    shadow-lg
                                    transition-transform duration-300
                                    group-hover:scale-110
                                    ${isConnecting ? 'animate-pulse' : ''}
                                `}>
                                    {isConnecting ? (
                                        <Loader2 className="h-7 w-7 animate-spin" />
                                    ) : (
                                        <Icon className="h-7 w-7" />
                                    )}
                                </div>

                                {/* Platform Name */}
                                <span className={`
                                    font-semibold text-[var(--text-primary)]
                                    transition-colors duration-200
                                    ${isDisabled ? 'opacity-50' : ''}
                                `}>
                                    {platform.name}
                                </span>

                                {/* Connecting State Label */}
                                {isConnecting && (
                                    <span className="absolute bottom-2 text-xs text-[var(--text-muted)] animate-pulse">
                                        Connecting...
                                    </span>
                                )}

                                {/* Subtle gradient border glow on hover */}
                                <div className={`
                                    absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
                                    transition-opacity duration-300
                                    bg-gradient-to-br ${platform.gradient}
                                    -z-10 blur-xl
                                `} style={{ transform: 'scale(0.85)' }} />
                            </button>
                        );
                    })}
                </div>

                {/* Info Footer */}
                <p className="text-center text-xs text-[var(--text-muted)] pt-2 border-t border-white/5">
                    You&apos;ll be redirected to authorize SocialiseIT
                </p>
            </DialogContent>
        </Dialog>
    );
}
