/**
 * Platform Integration Module
 * Barrel file re-exporting all platform functionality.
 * 
 * Why: Single import point maintains backwards compatibility
 * while enabling modular internal structure.
 */

export type { Platform, ProductTagPayload } from './types';
export { getAuthorizationUrl, exchangeCodeForToken } from './oauth';
export { getCredentialsForPlatform } from './credentials';
export { publishToPlatform } from './publishing/orchestrator';
export { isTokenExpiringSoon } from './utils';
