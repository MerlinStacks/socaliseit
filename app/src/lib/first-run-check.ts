/**
 * First-run detection utility
 * Checks if this is a fresh installation (no users in the database).
 * Used by root page and dashboard layout to redirect to setup wizard.
 */

import { db } from './db';

// Only caches false (users exist = stable state).
// Never caches true so we re-check after the first user is created.
let hasUsers = false;

/**
 * Returns true if no users exist in the database (first-run state).
 * Once users are detected, the result is cached for the process lifetime
 * since users don't get un-created.
 */
export async function isFirstRun(): Promise<boolean> {
    if (hasUsers) return false;

    try {
        const count = await db.user.count();
        if (count > 0) {
            hasUsers = true;
            return false;
        }
        return true;
    } catch {
        // DB not ready yet — treat as first run to show setup wizard
        return true;
    }
}

