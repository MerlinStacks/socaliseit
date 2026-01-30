'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
    ShoppingBag, Plus, Instagram, Youtube, Loader2, Trash2, AlertCircle
} from 'lucide-react';

interface ShopConnection {
    id: string;
    platform: 'INSTAGRAM' | 'FACEBOOK' | 'PINTEREST' | 'TIKTOK' | 'YOUTUBE';
    catalogId: string;
    name: string;
    syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
    lastSyncAt: string | null;
    lastSyncError: string | null;
}

export function ShoppingSettings() {
    const [shops, setShops] = useState<ShopConnection[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState<Record<string, boolean>>({});
    const [showConnectModal, setShowConnectModal] = useState(false);

    // Connect Form State
    const [connectPlatform, setConnectPlatform] = useState('INSTAGRAM');
    const [connectCatalogId, setConnectCatalogId] = useState('');
    const [connectName, setConnectName] = useState('');
    const [connectLoading, setConnectLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchShops();
    }, []);

    async function fetchShops() {
        try {
            const res = await fetch('/api/commerce/shops');
            const data = await res.json();
            setShops(data.shops || []);
        } catch (err) {
            console.error('Failed to fetch shops:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSync(platform: string) {
        setSyncing(prev => ({ ...prev, [platform]: true }));
        try {
            await fetch('/api/commerce/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
            // Refresh list to update timestamps/status
            await fetchShops();
        } catch (err) {
            console.error('Sync failed:', err);
        } finally {
            setSyncing(prev => ({ ...prev, [platform]: false }));
        }
    }

    async function handleConnect(e: React.FormEvent) {
        e.preventDefault();
        setConnectLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/commerce/shops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: connectPlatform,
                    catalogId: connectCatalogId,
                    name: connectName,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setShowConnectModal(false);
                setConnectCatalogId('');
                setConnectName('');
                await fetchShops();
            } else {
                setError(data.error || 'Failed to connect shop');
            }
        } catch (err) {
            setError('Failed to connect shop');
        } finally {
            setConnectLoading(false);
        }
    }

    async function handleDisconnect(platform: string) {
        if (!confirm('Are you sure you want to disconnect this shop? Product tags in existing posts may stop working.')) return;

        try {
            await fetch(`/api/commerce/shops?platform=${platform}`, {
                method: 'DELETE',
            });
            await fetchShops();
        } catch (err) {
            console.error('Failed to disconnect:', err);
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5" />
                        Shopping & Commerce
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Connect platform catalogs to enable product tagging
                    </p>
                </div>
                <Button onClick={() => setShowConnectModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Shop
                </Button>
            </div>

            {/* List of Connected Shops */}
            <div className="space-y-4">
                {shops.length === 0 && !loading && (
                    <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-8 text-center">
                        <ShoppingBag className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-50" />
                        <h3 className="mt-2 text-sm font-medium">No shops connected</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-[300px] mx-auto">
                            Connect your Instagram Shop, Facebook Catalog, or Pinterest Catalog to tag products in your posts.
                        </p>
                    </div>
                )}

                {shops.map((shop) => (
                    <div key={shop.id} className="card p-6">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)]">
                                    {shop.platform === 'INSTAGRAM' && <Instagram className="h-6 w-6" />}
                                    {shop.platform === 'FACEBOOK' && <div className="font-bold text-xl">f</div>}
                                    {shop.platform === 'PINTEREST' && <div className="font-bold text-xl text-red-500">P</div>}
                                    {shop.platform === 'TIKTOK' && <div className="font-bold text-xl">d</div>}
                                    {shop.platform === 'YOUTUBE' && <Youtube className="h-6 w-6 text-red-500" />}
                                </div>
                                <div>
                                    <h3 className="font-medium">{shop.name}</h3>
                                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                        <span>ID: {shop.catalogId}</span>
                                        <span>•</span>
                                        <span>Platform: {shop.platform}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSync(shop.platform)}
                                    disabled={syncing[shop.platform]}
                                    className="h-8 text-xs"
                                >
                                    {syncing[shop.platform] ? (
                                        <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Syncing...</>
                                    ) : (
                                        'Sync Catalog'
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => handleDisconnect(shop.platform)}
                                    className="h-8 w-8 p-0 text-[var(--error)] hover:bg-red-500/10 hover:text-[var(--error)]"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Status Bar */}
                        <div className="mt-4 flex items-center gap-4 text-xs">
                            <div className="flex items-center gap-1.5">
                                <div className={`h-2 w-2 rounded-full ${shop.syncStatus === 'SYNCED' ? 'bg-[var(--success)]' :
                                    shop.syncStatus === 'FAILED' ? 'bg-[var(--error)]' :
                                        shop.syncStatus === 'SYNCING' ? 'bg-[var(--accent-gold)] animate-pulse' :
                                            'bg-[var(--text-muted)]'
                                    }`} />
                                <span className="font-medium">
                                    {shop.syncStatus === 'SYNCED' ? 'Synced' :
                                        shop.syncStatus === 'FAILED' ? 'Sync Failed' :
                                            shop.syncStatus === 'SYNCING' ? 'Syncing...' :
                                                'Pending'}
                                </span>
                            </div>

                            {shop.lastSyncAt && (
                                <span className="text-[var(--text-muted)]">
                                    Last synced: {new Date(shop.lastSyncAt).toLocaleString()}
                                </span>
                            )}

                            {shop.lastSyncError && (
                                <span className="text-[var(--error)] flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {shop.lastSyncError}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Connect Modal */}
            <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Connect Platform Shop</DialogTitle>
                        <DialogDescription>
                            Enter your platform catalog details to enable product tagging.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleConnect} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Platform</label>
                            <select
                                value={connectPlatform}
                                onChange={(e) => setConnectPlatform(e.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                            >
                                <option value="INSTAGRAM">Instagram Shop</option>
                                <option value="FACEBOOK">Facebook Catalog</option>
                                <option value="PINTEREST">Pinterest Catalog</option>
                                <option value="TIKTOK">TikTok Shop</option>
                                <option value="YOUTUBE">YouTube Shopping</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Shop Name</label>
                            <Input
                                type="text"
                                value={connectName}
                                onChange={(e) => setConnectName(e.target.value)}
                                placeholder="e.g. Instagram US Store"
                                required
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Catalog ID / Shop ID</label>
                            <Input
                                type="text"
                                value={connectCatalogId}
                                onChange={(e) => setConnectCatalogId(e.target.value)}
                                placeholder="Platform specific ID"
                                required
                            />
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                                Found in your platform&apos;s Commerce Manager settings
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-xs text-[var(--error)] flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <DialogFooter className="flex gap-3">
                            <Button type="button" variant="secondary" onClick={() => setShowConnectModal(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={connectLoading} className="flex-1">
                                {connectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
