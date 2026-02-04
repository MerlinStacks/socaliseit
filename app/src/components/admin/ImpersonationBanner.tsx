'use client';

/**
 * Impersonation Banner Component
 * Why: Shows when super admin is impersonating a user, with exit button
 * Appears as a sticky banner at the top of the app
 */

import { useState, useEffect } from 'react';
import { Eye, X, ArrowLeft } from 'lucide-react';

interface ImpersonationState {
    active: boolean;
    userName?: string;
    userEmail?: string;
}

/**
 * Checks impersonation status via API
 */
async function checkImpersonation(): Promise<ImpersonationState> {
    try {
        const res = await fetch('/api/admin/impersonate/status');
        if (res.ok) {
            const data = await res.json();
            if (data.isImpersonating && data.targetUser) {
                return {
                    active: true,
                    userName: data.targetUser.name,
                    userEmail: data.targetUser.email,
                };
            }
        }
    } catch {
        // Silent fail - not impersonating
    }
    return { active: false };
}

export default function ImpersonationBanner() {
    const [state, setState] = useState<ImpersonationState>({ active: false });
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        checkImpersonation().then(setState);
    }, []);

    const handleExit = async () => {
        setExiting(true);
        try {
            const res = await fetch('/api/admin/impersonate', {
                method: 'DELETE',
            });

            if (res.ok) {
                // Redirect back to admin panel
                window.location.href = '/admin/users';
            }
        } catch (error) {
            console.error('Failed to exit impersonation:', error);
        } finally {
            setExiting(false);
        }
    };

    if (!state.active) {
        return null;
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-amber-600 to-orange-600 text-white">
            <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                    <Eye className="h-4 w-4" />
                    <span className="text-sm font-medium">
                        Viewing as: <strong>{state.userName || state.userEmail}</strong>
                    </span>
                </div>
                <button
                    onClick={handleExit}
                    disabled={exiting}
                    className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {exiting ? 'Exiting...' : 'Exit Impersonation'}
                </button>
            </div>
        </div>
    );
}
