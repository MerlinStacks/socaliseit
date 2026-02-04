/**
 * Connected Accounts (Legacy Re-Export)
 * 
 * Why: This file has been decomposed into the /connected-accounts/ directory.
 * This re-export maintains backward compatibility with existing imports.
 * 
 * Refactoring Summary:
 * - Original: 1,070 lines
 * - New structure: 11 files, ~1,354 lines total (with better separation of concerns)
 * - Main component: ~155 lines (well under 200-line standard)
 * 
 * Components extracted:
 * - platform-icons.tsx: Custom SVG icons for TikTok, Pinterest, Google, Bluesky
 * - platform-config.ts: Brand colors, gradients, and profile URL helpers
 * - types.ts: Shared TypeScript interfaces
 * - use-connected-accounts.ts: State management hook
 * - BlueskyConnectDialog.tsx: Bluesky AT Protocol auth modal
 * - PinterestConnectDialog.tsx: Late.dev OAuth flow modal
 * - GbpLocationPickerDialog.tsx: Google Business location selector
 * - AddPlatformDialog.tsx: Platform selection modal
 * - AccountCard.tsx: Individual account display card
 * - ConnectedAccounts.tsx: Main orchestrator component
 * - index.ts: Module re-exports
 */
'use client';

export { ConnectedAccounts } from './connected-accounts';
