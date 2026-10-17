import { describe, expect, it } from 'vitest';
import { groupShopConnections } from '../commerce-shop-groups';

describe('shared Meta catalog display', () => {
    const instagram = { platform: 'INSTAGRAM', catalogId: 'shared', syncStatus: 'SYNCED' };
    const facebook = { ...instagram, platform: 'FACEBOOK' };
    it('shows one card and action for the shared catalog', () => {
        expect(groupShopConnections([instagram, facebook])).toEqual([{
            key: 'META:shared', shop: instagram, platforms: ['INSTAGRAM', 'FACEBOOK'], isMeta: true,
        }]);
    });
    it('keeps different Meta catalogs and non-Meta connections separate', () => {
        expect(groupShopConnections([instagram, { ...facebook, catalogId: 'different' }, { ...facebook, platform: 'PINTEREST' }])).toHaveLength(3);
    });
    it('never hides an outstanding error or in-progress import behind a synced sibling', () => {
        const failed = { ...facebook, syncStatus: 'FAILED' };
        expect(groupShopConnections([instagram, failed])[0].shop).toBe(failed);
        const syncing = { ...instagram, syncStatus: 'SYNCING' };
        expect(groupShopConnections([syncing, failed])[0].shop).toBe(syncing);
    });
});
