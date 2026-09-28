'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Users } from 'lucide-react';
import { PLATFORM_CONFIG, type PlatformId } from '@/components/settings/connected-accounts/platform-config';
import type { Recommendation } from './types';

type Option = { id: string; name: string; username?: string | null; platform?: string | null };

function AccountLabel({ account }: { account: Option }) {
    const key = account.platform?.toLowerCase();
    const config = key && Object.hasOwn(PLATFORM_CONFIG, key) ? PLATFORM_CONFIG[key as PlatformId] : undefined;
    const Icon = config?.icon ?? (account.id === 'all' ? Users : Globe);
    const platform = config?.name ?? account.platform?.replaceAll('_', ' ');
    return <>
        <span aria-hidden="true" className={`seb-account-icon ${config ? `${config.iconBg} text-white` : ''}`}>
            <Icon className="h-4 w-4" />
        </span>
        <span className="seb-account-copy">
            <span>{account.name}</span>
            {(platform || account.username) && <small>{[platform, account.username && `@${account.username.replace(/^@/, '')}`].filter(Boolean).join(' · ')}</small>}
        </span>
    </>;
}

/** Rich account choices keep duplicate display names distinguishable. */
export function AccountFilter({ recommendations, value, onChange }: {
    recommendations: Recommendation[]; value: string; onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const id = useId();
    const accounts = new Map(recommendations.flatMap(item => item.socialAccount
        ? [[item.socialAccount.id, { ...item.socialAccount, platform: item.socialAccount.platform ?? item.platform }] as const] : []));
    const options: Option[] = [
        { id: 'all', name: 'All accounts' },
        { id: 'unassigned', name: 'Workspace-wide / no account' },
        ...accounts.values(),
    ];
    const selected = options.find(option => option.id === value) ?? options[0];

    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    return <div className="seb-account-filter" ref={root} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
        if (event.key === 'Escape') {
            setOpen(false);
            trigger.current?.focus();
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (!open) { setOpen(true); return; }
        const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
    }}>
        <label id={`${id}-label`} htmlFor={`${id}-trigger`}>Account</label>
        <button ref={trigger} id={`${id}-trigger`} type="button" className="seb-account-trigger"
            aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
            onClick={() => setOpen(!open)}>
            <AccountLabel account={selected} /><ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && <div id={`${id}-menu`} role="menu" aria-labelledby={`${id}-label`} className="seb-account-menu">
            {options.map(option => <button key={option.id} type="button" role="menuitemradio"
                aria-checked={option.id === value} className="seb-account-option" onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                    trigger.current?.focus();
                }}>
                <AccountLabel account={option} />
                {option.id === value && <Check size={16} aria-hidden="true" />}
            </button>)}
        </div>}
    </div>;
}
