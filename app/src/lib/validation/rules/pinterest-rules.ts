/**
 * Pinterest Validation Rules
 *
 * Why: Pinterest requires a board selection before a pin can be created.
 * Catching this at validation-time prevents failed publish jobs and gives
 * the user immediate feedback in the composer UI.
 */

import type { ValidationRule } from '../types';

/** All Pinterest-specific validation rules. */
export const pinterestRules: ValidationRule[] = [
    {
        id: 'pinterest-board-required',
        platform: 'pinterest',
        type: 'postType',
        check: (context) => {
            const boardId = context.platformSettings?.pinterest?.boardId;
            if (!boardId) {
                return {
                    status: 'error',
                    message: 'Select a Pinterest board before publishing',
                };
            }
            return { status: 'pass', message: 'Board selected' };
        },
    },
];
