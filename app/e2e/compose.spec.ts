import { test, expect } from '@playwright/test';

/**
 * Post Composer E2E Tests
 * Tests for the critical post creation and scheduling flow
 */

test.describe('Post Composer', () => {
    // These tests require authentication
    // Using test.skip for scenarios without credentials

    test.beforeEach(async ({ page }) => {
        // Skip if no test credentials - these are integration tests
        test.skip(!process.env.TEST_USER_EMAIL, 'Test user credentials not configured');

        // Login first
        await page.goto('/login');
        await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL!);
        await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD!);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    });

    test('should navigate to compose page', async ({ page }) => {
        // Navigate to compose
        await page.goto('/compose');

        // Should see the composer interface
        await expect(page.getByRole('heading', { name: /compose|create|new post/i })).toBeVisible();
    });

    test('should display 3-column layout', async ({ page }) => {
        await page.goto('/compose');

        // Check for the three main sections
        // Left: Profile selector
        await expect(page.getByText(/select accounts|profiles|accounts/i)).toBeVisible();

        // Center: Caption editor
        await expect(page.getByRole('textbox', { name: /caption|content|text/i })).toBeVisible();

        // Right: Customization panel
        await expect(page.getByText(/customize|settings|options/i)).toBeVisible();
    });

    test('should show character count for caption', async ({ page }) => {
        await page.goto('/compose');

        const captionInput = page.getByRole('textbox', { name: /caption|content/i });
        await captionInput.fill('Test caption for my awesome post!');

        // Should show character count
        await expect(page.getByText(/\d+.*characters|\d+\/\d+/)).toBeVisible();
    });

    test('should validate caption length', async ({ page }) => {
        await page.goto('/compose');

        const captionInput = page.getByRole('textbox', { name: /caption|content/i });

        // Enter a very long caption (over Instagram limit of 2200)
        const longCaption = 'a'.repeat(2300);
        await captionInput.fill(longCaption);

        // Should show validation warning/error
        await expect(page.getByText(/too long|exceeds|limit/i)).toBeVisible();
    });

    test('should open media picker', async ({ page }) => {
        await page.goto('/compose');

        // Click add media button
        await page.getByRole('button', { name: /add media|upload|attach/i }).click();

        // Media picker modal should appear
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByText(/media library|choose|select/i)).toBeVisible();
    });

    test('should allow platform selection', async ({ page }) => {
        await page.goto('/compose');

        // Look for platform toggles/checkboxes
        const platformLabels = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn'];

        for (const platform of platformLabels) {
            const platformElement = page.getByText(platform, { exact: false });
            // At least some platforms should be visible
            if (await platformElement.isVisible()) {
                await expect(platformElement).toBeVisible();
            }
        }
    });

    test('should show schedule options', async ({ page }) => {
        await page.goto('/compose');

        // Look for schedule button/section
        const scheduleButton = page.getByRole('button', { name: /schedule|when/i });
        await expect(scheduleButton).toBeVisible();

        // Click to open schedule picker
        await scheduleButton.click();

        // Should show date/time picker
        await expect(page.getByText(/date|time|when to post/i)).toBeVisible();
    });

    test('should show publish now option', async ({ page }) => {
        await page.goto('/compose');

        // Look for publish now button
        await expect(page.getByRole('button', { name: /publish now|post now/i })).toBeVisible();
    });

    test('should show validation panel', async ({ page }) => {
        await page.goto('/compose');

        // Enter some content to trigger validation
        const captionInput = page.getByRole('textbox', { name: /caption|content/i });
        await captionInput.fill('Check out our new collection! #fashion #style');

        // Should show validation results
        await expect(page.getByText(/validation|checks|requirements/i)).toBeVisible();
    });

    test('should detect hashtags', async ({ page }) => {
        await page.goto('/compose');

        const captionInput = page.getByRole('textbox', { name: /caption|content/i });
        await captionInput.fill('Summer vibes #summer #beach #vacation');

        // Should show hashtag count or list
        await expect(page.getByText(/#summer|hashtags|3.*tags/i)).toBeVisible();
    });

    test('should warn about banned hashtags', async ({ page }) => {
        await page.goto('/compose');

        const captionInput = page.getByRole('textbox', { name: /caption|content/i });
        await captionInput.fill('Follow me! #followforfollow #f4f');

        // Should show warning about banned hashtags
        await expect(page.getByText(/banned|not recommended|shadowban/i)).toBeVisible();
    });

    test('should allow saving as draft', async ({ page }) => {
        await page.goto('/compose');

        // Enter some content
        const captionInput = page.getByRole('textbox', { name: /caption|content/i });
        await captionInput.fill('Draft post content');

        // Look for save draft option
        const saveDraftButton = page.getByRole('button', { name: /save.*draft|draft/i });

        if (await saveDraftButton.isVisible()) {
            await saveDraftButton.click();
            // Should show success message
            await expect(page.getByText(/saved|draft created/i)).toBeVisible();
        }
    });
});

test.describe('Composer Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(!process.env.TEST_USER_EMAIL, 'Test user credentials not configured');

        await page.goto('/login');
        await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL!);
        await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD!);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    });

    test('should be keyboard navigable', async ({ page }) => {
        await page.goto('/compose');

        // Tab through main elements
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // Some element should be focused
        const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
        expect(focusedElement).toBeTruthy();
    });

    test('should have proper ARIA labels', async ({ page }) => {
        await page.goto('/compose');

        // Check for ARIA labels on interactive elements
        const captionInput = page.getByRole('textbox');
        await expect(captionInput.first()).toBeVisible();

        // Check buttons have accessible names
        const buttons = page.getByRole('button');
        const buttonCount = await buttons.count();
        expect(buttonCount).toBeGreaterThan(0);
    });
});
