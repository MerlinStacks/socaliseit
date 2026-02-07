'use client';

/**
 * Long Press FAB Actions
 * Shows quick actions menu on long-press of Create button
 * Why: Faster access to specific content types (Post, Story, Reel)
 */

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Image, Film, Clock, X } from 'lucide-react';

interface QuickAction {
    id: string;
    label: string;
    icon: typeof Image;
    href?: string;
    onClick?: () => void;
}

const DEFAULT_ACTIONS: QuickAction[] = [
    { id: 'post', label: 'Post', icon: Image },
    { id: 'story', label: 'Story', icon: Clock },
    { id: 'reel', label: 'Reel', icon: Film },
];

interface LongPressFABProps {
    children: ReactNode;
    actions?: QuickAction[];
    onAction?: (actionId: string) => void;
    longPressDelay?: number;
    className?: string;
}

/**
 * Wrapper that adds long-press menu to FAB
 */
export function LongPressFAB({
    children,
    actions = DEFAULT_ACTIONS,
    onAction,
    longPressDelay = 500,
    className,
}: LongPressFABProps) {
    const [isOpen, setIsOpen] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPressRef = useRef(false);

    const startPress = useCallback(() => {
        isLongPressRef.current = false;
        timerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            setIsOpen(true);
            // Haptic feedback on mobile
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, longPressDelay);
    }, [longPressDelay]);

    const endPress = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleAction = useCallback((actionId: string) => {
        setIsOpen(false);
        onAction?.(actionId);
    }, [onAction]);

    return (
        <div className={cn('relative', className)}>
            {/* Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Quick Actions Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className={cn(
                            'absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-50',
                            'flex flex-col gap-2'
                        )}
                    >
                        {actions.map((action, index) => (
                            <motion.button
                                key={action.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => handleAction(action.id)}
                                className={cn(
                                    'flex items-center gap-3 px-4 py-3 rounded-xl',
                                    'bg-[var(--bg-primary)] border border-[var(--border)]',
                                    'text-[var(--text-primary)] shadow-lg',
                                    'hover:bg-[var(--bg-secondary)] transition-colors',
                                    'min-w-[140px]'
                                )}
                            >
                                <action.icon className="h-5 w-5 text-[var(--accent-gold)]" />
                                <span className="font-medium">{action.label}</span>
                            </motion.button>
                        ))}

                        {/* Close button */}
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                                'mx-auto mt-2 flex h-10 w-10 items-center justify-center',
                                'rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)]',
                                'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            <X className="h-5 w-5" />
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FAB with long-press handlers */}
            <div
                onMouseDown={startPress}
                onMouseUp={endPress}
                onMouseLeave={endPress}
                onTouchStart={startPress}
                onTouchEnd={endPress}
                onTouchCancel={endPress}
                className="relative z-50"
            >
                {children}
            </div>
        </div>
    );
}

export default LongPressFAB;
