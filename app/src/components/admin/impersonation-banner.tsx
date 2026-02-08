'use client';

/**
 * Impersonation Banner
 * Shows a warning banner when an admin is impersonating a user
 * 
 * Why: Admins need clear visual feedback that they're viewing the app as another user,
 * and an easy way to exit impersonation mode.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, X, UserCircle } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';

interface ImpersonationStatus {
    isImpersonating: boolean;
    targetUser?: { id: string; name: string | null; email: string };
}

export function ImpersonationBanner() {
    const [status, setStatus] = useState<ImpersonationStatus>({ isImpersonating: false });
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        checkImpersonationStatus();
    }, []);

    const checkImpersonationStatus = async () => {
        try {
            const res = await fetch('/api/admin/impersonate/status');
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch {
            // Silently fail - not impersonating
        }
    };

    const exitImpersonation = async () => {
        setExiting(true);
        try {
            const res = await fetch('/api/admin/impersonate', { method: 'DELETE' });
            if (res.ok) {
                // Redirect to admin panel after exiting
                window.location.href = '/admin/users';
            }
        } catch (error) {
            showErrorToast(error, 'Failed to exit impersonation');
            setExiting(false);
        }
    };

    if (!status.isImpersonating) {
        return null;
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-600 text-amber-950">
            <div className="container mx-auto flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5" />
                    <div className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4" />
                        <span className="font-medium">
                            Impersonating: {status.targetUser?.name || status.targetUser?.email}
                        </span>
                    </div>
                </div>
                <button
                    onClick={exitImpersonation}
                    disabled={exiting}
                    className="flex items-center gap-2 rounded-md bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50 transition-colors"
                >
                    {exiting ? (
                        'Exiting...'
                    ) : (
                        <>
                            <X className="h-4 w-4" />
                            Exit Impersonation
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
