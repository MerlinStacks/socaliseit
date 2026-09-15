/** Keep old bookmarks and notification/OAuth links working after tab consolidation. */
const SETTINGS_TAB_ALIASES = {
    profile: 'profile',
    notifications: 'profile',
    organization: 'organization',
    'brand-tone': 'organization',
    accounts: 'accounts',
    shopping: 'accounts',
    team: 'team',
    appearance: 'appearance',
    billing: 'billing',
} as const;

export function resolveSettingsTab(tab: string | null): string | null {
    if (!tab || !Object.prototype.hasOwnProperty.call(SETTINGS_TAB_ALIASES, tab)) return null;
    return SETTINGS_TAB_ALIASES[tab as keyof typeof SETTINGS_TAB_ALIASES];
}
