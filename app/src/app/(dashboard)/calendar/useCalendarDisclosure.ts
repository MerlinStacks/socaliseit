'use client';

import { useEffect, useRef, useState } from 'react';

/** Non-modal disclosure: Tab stays native; only Escape returns trigger focus. */
export function useCalendarDisclosure() {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const dismissOutside = (event: Event) => {
            if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', dismissOutside);
        document.addEventListener('click', dismissOutside);
        document.addEventListener('focusin', dismissOutside);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', dismissOutside);
            document.removeEventListener('click', dismissOutside);
            document.removeEventListener('focusin', dismissOutside);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    return { isOpen, setIsOpen, panelRef, triggerRef };
}
