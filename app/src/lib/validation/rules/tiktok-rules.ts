/**
 * TikTok Validation Rules
 *
 * Why: TikTok Content Sharing Guidelines require that users explicitly
 * select a privacy level (Point 2b — "no default value") and complete
 * content disclosure (Point 3a — at least one option must be chosen
 * when the toggle is on) before publishing.
 */

import type { ValidationRule } from '../types';

/** All TikTok-specific validation rules. */
export const tiktokRules: ValidationRule[] = [
    {
        id: 'tiktok-privacy-required',
        platform: 'tiktok',
        type: 'postType',
        check: (context) => {
            const privacyLevel = context.platformSettings?.tiktok?.tiktokPrivacyLevel;
            if (!privacyLevel) {
                return {
                    status: 'error',
                    message: 'Select a privacy level before publishing to TikTok',
                };
            }
            return { status: 'pass', message: 'Privacy level selected' };
        },
    },
    {
        id: 'tiktok-disclosure-incomplete',
        platform: 'tiktok',
        type: 'postType',
        check: (context) => {
            const settings = context.platformSettings?.tiktok;
            const disclosureOn = settings?.tiktokContentDisclosure;
            if (!disclosureOn) {
                return { status: 'pass', message: 'Content disclosure not enabled' };
            }

            const brandOrganic = settings?.tiktokBrandOrganicToggle;
            const brandContent = settings?.tiktokBrandContentToggle;

            if (!brandOrganic && !brandContent) {
                return {
                    status: 'error',
                    message: 'Select at least one content disclosure option (Your Brand or Branded Content)',
                };
            }
            return { status: 'pass', message: 'Content disclosure configured' };
        },
    },
];
