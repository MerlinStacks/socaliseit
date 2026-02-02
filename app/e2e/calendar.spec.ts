/**
 * E2E Tests: Calendar Flow
 * Tests for the content calendar scheduling functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Calendar Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to calendar page (assumes authenticated session)
        await page.goto('/calendar');
    });

    test('should display calendar grid', async ({ page }) => {
        // Wait for calendar to load
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        // Check that day cells are rendered (at least 28 for 4 weeks)
        const dayCells = page.locator('[data-testid="calendar-day"]');
        const count = await dayCells.count();
        expect(count).toBeGreaterThanOrEqual(28);
    });

    test('should navigate between months', async ({ page }) => {
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        // Get current month header
        const monthHeader = page.locator('[data-testid="calendar-month-header"]');
        const initialMonth = await monthHeader.textContent();

        // Click next month button
        await page.click('[data-testid="calendar-next-month"]');

        // Verify month changed
        await expect(monthHeader).not.toHaveText(initialMonth || '');
    });

    test('should open post details on click', async ({ page }) => {
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        // Look for any scheduled post
        const scheduledPost = page.locator('[data-testid="calendar-post"]').first();

        // If there are scheduled posts, click one
        if (await scheduledPost.isVisible()) {
            await scheduledPost.click();

            // Expect post detail modal/panel to open
            await expect(page.locator('[data-testid="post-detail-modal"]')).toBeVisible();
        }
    });

    test('should drag and drop to reschedule post', async ({ page }) => {
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        const scheduledPost = page.locator('[data-testid="calendar-post"]').first();

        if (await scheduledPost.isVisible()) {
            // Get source and target cells
            const sourceCell = scheduledPost.locator('..'); // Parent cell
            const targetCell = page.locator('[data-testid="calendar-day"]').nth(5);

            // Perform drag and drop
            await scheduledPost.dragTo(targetCell);

            // Verify toast notification appears
            await expect(page.locator('[data-testid="toast"]')).toBeVisible();
        }
    });

    test('should filter posts by platform', async ({ page }) => {
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        // Open platform filter
        const platformFilter = page.locator('[data-testid="platform-filter"]');
        if (await platformFilter.isVisible()) {
            await platformFilter.click();

            // Select Instagram only
            await page.click('[data-testid="filter-instagram"]');

            // Verify filter is applied (all visible posts should be Instagram)
            const visiblePosts = page.locator('[data-testid="calendar-post"]:visible');
            const count = await visiblePosts.count();

            for (let i = 0; i < count; i++) {
                const post = visiblePosts.nth(i);
                await expect(post).toHaveAttribute('data-platform', 'instagram');
            }
        }
    });

    test('should switch between calendar views', async ({ page }) => {
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        // Check for view toggle buttons
        const weekViewBtn = page.locator('[data-testid="view-week"]');
        const dayViewBtn = page.locator('[data-testid="view-day"]');

        if (await weekViewBtn.isVisible()) {
            await weekViewBtn.click();
            await expect(page.locator('[data-testid="calendar-week-view"]')).toBeVisible();
        }

        if (await dayViewBtn.isVisible()) {
            await dayViewBtn.click();
            await expect(page.locator('[data-testid="calendar-day-view"]')).toBeVisible();
        }
    });

    test('should create new post from calendar', async ({ page }) => {
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });

        // Click on empty day cell
        const emptyCell = page.locator('[data-testid="calendar-day"]:not(:has([data-testid="calendar-post"]))').first();

        if (await emptyCell.isVisible()) {
            await emptyCell.click();

            // Expect compose modal or redirect to compose page
            const composeModal = page.locator('[data-testid="quick-compose-modal"]');
            const composeUrl = page.url();

            const modalVisible = await composeModal.isVisible().catch(() => false);
            const redirectedToCompose = composeUrl.includes('/compose');

            expect(modalVisible || redirectedToCompose).toBeTruthy();
        }
    });

    test('should show loading state while fetching posts', async ({ page }) => {
        // Intercept API call to delay it
        await page.route('**/api/posts/scheduled**', async (route) => {
            await new Promise((r) => setTimeout(r, 1000));
            await route.continue();
        });

        await page.goto('/calendar');

        // Should show loading skeleton
        await expect(page.locator('[data-testid="calendar-skeleton"]')).toBeVisible();

        // Then calendar should appear
        await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 15000 });
    });
});
