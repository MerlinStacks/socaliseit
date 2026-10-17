/** Group shared Meta catalogs for display without combining unrelated assets. */
export function groupShopConnections<T extends { platform: string; catalogId: string; syncStatus: string }>(shops: T[]) {
    const groups = new Map<string, { key: string; shop: T; platforms: string[]; isMeta: boolean }>();
    const priority: Record<string, number> = { SYNCING: 4, FAILED: 3, PENDING: 2, SYNCED: 1 };
    for (const shop of shops) {
        const isMeta = shop.platform === 'INSTAGRAM' || shop.platform === 'FACEBOOK';
        const key = `${isMeta ? 'META' : shop.platform}:${shop.catalogId}`;
        const existing = groups.get(key);
        if (existing) {
            existing.platforms.push(shop.platform);
            if ((priority[shop.syncStatus] ?? 0) > (priority[existing.shop.syncStatus] ?? 0)) existing.shop = shop;
        } else groups.set(key, { key, shop, platforms: [shop.platform], isMeta });
    }
    return Array.from(groups.values());
}
