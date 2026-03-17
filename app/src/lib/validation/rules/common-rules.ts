/**
 * Common Validation Rules
 *
 * Why: "No accounts" and "no caption" checks were duplicated in
 * compose-actions.ts (handleSaveDraft, handlePublishNow) and
 * use-compose.ts (handleOpenScheduleModal). Consolidating them
 * here means they appear in the validation panel alongside other
 * errors, giving consistent UX.
 */

import type { ValidationRule } from '../types';

/** Cross-platform rules that apply regardless of platform selection. */
export const commonRules: ValidationRule[] = [
    {
        id: 'accounts-required',
        platform: 'all',
        type: 'postType',
        check: (context) => {
            if (!context.selectedAccountCount || context.selectedAccountCount === 0) {
                return {
                    status: 'error',
                    message: 'Select at least one account to publish',
                };
            }
            return { status: 'pass', message: 'Accounts selected' };
        },
    },
    {
        id: 'caption-required',
        platform: 'all',
        type: 'caption',
        check: (context) => {
            // Stories don't require captions
            if (context.allPostsAreStories) {
                return { status: 'pass', message: 'Stories do not require captions' };
            }
            if (!context.caption || context.caption.trim().length === 0) {
                // Per-account caption overrides mean the main caption can be empty
                if (context.hasAnyCaptionOverride) {
                    return { status: 'pass', message: 'Per-account captions provided' };
                }
                return {
                    status: 'error',
                    message: 'Add a caption before publishing',
                };
            }
            return { status: 'pass', message: 'Caption provided' };
        },
    },
];
