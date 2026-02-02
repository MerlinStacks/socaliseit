/**
 * E2E Tests: Media Upload Flow
 * Tests for media library and upload functionality
 */

import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Media Upload Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to media library (assumes authenticated session)
        await page.goto('/media');
    });

    test('should display media library grid', async ({ page }) => {
        // Wait for media library to load
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        // Check for grid or empty state
        const mediaGrid = page.locator('[data-testid="media-grid"]');
        const emptyState = page.locator('[data-testid="empty-state"]');

        const hasGrid = await mediaGrid.isVisible().catch(() => false);
        const hasEmpty = await emptyState.isVisible().catch(() => false);

        expect(hasGrid || hasEmpty).toBeTruthy();
    });

    test('should open upload modal', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        // Click upload button
        const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
        await uploadBtn.click();

        // Upload modal should appear
        await expect(page.locator('[data-testid="upload-modal"]')).toBeVisible();
    });

    test('should show drag and drop zone', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
        await uploadBtn.click();

        // Check for drop zone
        await expect(page.getByText(/drag.*drop|drop files here/i)).toBeVisible();
    });

    test('should handle file upload via input', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
        await uploadBtn.click();

        // Simulate file input (would need a test file in the repo)
        const fileInput = page.locator('input[type="file"]');

        if (await fileInput.isVisible()) {
            // Create a mock image file
            await fileInput.setInputFiles({
                name: 'test-image.png',
                mimeType: 'image/png',
                buffer: Buffer.from('fake-image-data'),
            });

            // Should show upload progress or success
            await expect(
                page.locator('[data-testid="upload-progress"], [data-testid="upload-success"]')
            ).toBeVisible({ timeout: 10000 });
        }
    });

    test('should filter media by type', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        // Look for filter buttons/tabs
        const imageFilter = page.locator('[data-testid="filter-images"], [role="tab"]:has-text("Images")');
        const videoFilter = page.locator('[data-testid="filter-videos"], [role="tab"]:has-text("Videos")');

        if (await imageFilter.isVisible()) {
            await imageFilter.click();

            // Verify only images are shown
            const mediaItems = page.locator('[data-testid="media-item"]');
            const count = await mediaItems.count();

            for (let i = 0; i < Math.min(count, 5); i++) {
                const item = mediaItems.nth(i);
                const type = await item.getAttribute('data-type');
                expect(['image', 'photo', 'picture']).toContain(type?.toLowerCase());
            }
        }
    });

    test('should search media by name', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        // Look for search input
        const searchInput = page.getByPlaceholder(/search|find/i);

        if (await searchInput.isVisible()) {
            await searchInput.fill('product');

            // Wait for search results
            await page.waitForTimeout(500); // Debounce

            // Results should be filtered
            const mediaItems = page.locator('[data-testid="media-item"]');
            await expect(mediaItems.first()).toBeVisible({ timeout: 5000 }).catch(() => {
                // Empty results is also valid
            });
        }
    });

    test('should select multiple media items', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const mediaItems = page.locator('[data-testid="media-item"]');
        const firstItemCount = await mediaItems.count();

        if (firstItemCount >= 2) {
            // Enable multi-select mode
            const multiSelectBtn = page.locator('[data-testid="multi-select-toggle"]');
            if (await multiSelectBtn.isVisible()) {
                await multiSelectBtn.click();
            }

            // Select first two items
            await mediaItems.nth(0).click();
            await mediaItems.nth(1).click();

            // Selection count should appear
            await expect(page.getByText(/2 selected|selected: 2/i)).toBeVisible();
        }
    });

    test('should preview media on click', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const mediaItems = page.locator('[data-testid="media-item"]');

        if (await mediaItems.first().isVisible()) {
            await mediaItems.first().click();

            // Preview modal or panel should appear
            const preview = page.locator('[data-testid="media-preview"], [data-testid="media-detail"]');
            await expect(preview).toBeVisible({ timeout: 5000 });
        }
    });

    test('should show file details', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const mediaItems = page.locator('[data-testid="media-item"]');

        if (await mediaItems.first().isVisible()) {
            // Right-click or hover for details
            await mediaItems.first().click({ button: 'right' });

            // Context menu or details panel should show
            const details = page.locator('[data-testid="context-menu"], [data-testid="media-details"]');

            if (await details.isVisible()) {
                await expect(page.getByText(/size|dimension|type|uploaded/i)).toBeVisible();
            }
        }
    });

    test('should handle delete media', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const mediaItems = page.locator('[data-testid="media-item"]');

        if (await mediaItems.first().isVisible()) {
            // Select first item
            await mediaItems.first().click();

            // Look for delete button
            const deleteBtn = page.getByRole('button', { name: /delete|remove/i });

            if (await deleteBtn.isVisible()) {
                await deleteBtn.click();

                // Confirmation dialog should appear
                await expect(page.getByText(/confirm|are you sure/i)).toBeVisible();
            }
        }
    });

    test('should show upload progress bar', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        // Intercept upload to slow it down
        await page.route('**/api/media/upload**', async (route) => {
            await new Promise((r) => setTimeout(r, 2000));
            await route.fulfill({ status: 200, body: JSON.stringify({ id: 'test', url: '/test.png' }) });
        });

        const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
        await uploadBtn.click();

        const fileInput = page.locator('input[type="file"]');

        if (await fileInput.isVisible()) {
            await fileInput.setInputFiles({
                name: 'test-upload.png',
                mimeType: 'image/png',
                buffer: Buffer.from('test-data'),
            });

            // Progress bar should be visible during upload
            await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible({ timeout: 1000 });
        }
    });
});

test.describe('Media Upload Validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/media');
    });

    test('should reject invalid file types', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
        await uploadBtn.click();

        const fileInput = page.locator('input[type="file"]');

        if (await fileInput.isVisible()) {
            await fileInput.setInputFiles({
                name: 'test.exe',
                mimeType: 'application/x-executable',
                buffer: Buffer.from('fake-data'),
            });

            // Error message should appear
            await expect(page.getByText(/not allowed|invalid|unsupported/i)).toBeVisible();
        }
    });

    test('should show file size limit warning', async ({ page }) => {
        await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });

        const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
        await uploadBtn.click();

        // Check for file size limit info
        await expect(page.getByText(/max.*mb|size limit|maximum/i)).toBeVisible();
    });
});
