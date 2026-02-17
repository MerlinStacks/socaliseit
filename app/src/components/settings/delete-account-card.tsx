'use client';

/**
 * Delete Account Card
 * Why: Self-contained danger-zone component for permanent account deletion
 * with password + typed confirmation guard.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';

export function DeleteAccountCard() {
    const [showModal, setShowModal] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDelete() {
        if (confirmation !== 'DELETE') {
            setError('Please type DELETE to confirm');
            return;
        }
        setError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/user/delete-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, confirmation }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                // Why: Full page redirect clears all client state after deletion
                window.location.href = '/login?deleted=true';
            } else {
                setError(data.error || 'Failed to delete account');
            }
        } catch (err) {
            showErrorToast(err, 'Failed to delete account');
            setError('Failed to delete account');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <div className="card border-[var(--error)] p-6">
                <h3 className="font-semibold text-[var(--error)] mb-4">Danger Zone</h3>
                <p className="mb-4 text-sm text-[var(--text-secondary)]">
                    Permanently delete your account and all associated data
                </p>
                <Button variant="danger" onClick={() => setShowModal(true)}>
                    Delete Account
                </Button>
            </div>

            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-[var(--error)]">Delete Account</DialogTitle>
                        <DialogDescription>
                            This action is <strong>permanent</strong> and cannot be undone. All your data, including workspaces, posts, and media, will be deleted.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 mb-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                Type <code className="bg-[var(--bg-tertiary)] px-1 rounded">DELETE</code> to confirm
                            </label>
                            <Input
                                type="text"
                                value={confirmation}
                                onChange={(e) => setConfirmation(e.target.value)}
                                placeholder="DELETE"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-[var(--error)] mb-4">{error}</p>
                    )}

                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => { setShowModal(false); setPassword(''); setConfirmation(''); setError(null); }}
                            className="w-full sm:flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            disabled={loading || confirmation !== 'DELETE'}
                            className="w-full sm:flex-1"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Forever'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
