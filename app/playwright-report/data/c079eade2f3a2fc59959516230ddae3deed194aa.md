# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-upload.spec.ts >> Media Upload Flow >> should open upload modal
- Location: e2e/media-upload.spec.ts:29:4

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="media-library"]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "to.be.visible" with timeout 10000ms
  - waiting for locator('[data-testid="media-library"]')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - text: "NotFoundError: Not Found"
  - text: at error (/home/agent/.local/share/bun/install/global/node_modules/send/index.js:168:31)
  - text: at pipe (/home/agent/.local/share/bun/install/global/node_modules/send/index.js:468:14)
  - text: at sendfile (/home/agent/.local/share/bun/install/global/node_modules/express/lib/response.js:1014:8)
  - text: at sendFile (/home/agent/.local/share/bun/install/global/node_modules/express/lib/response.js:411:3)
  - text: at <anonymous> (/home/agent/.local/share/bun/install/global/node_modules/@openchamber/web/server/lib/opencode/static-routes-runtime.js:51:13)
  - text: at handleRequest (/home/agent/.local/share/bun/install/global/node_modules/router/lib/layer.js:152:17)
  - text: at next (/home/agent/.local/share/bun/install/global/node_modules/router/lib/route.js:157:13)
  - text: at dispatch (/home/agent/.local/share/bun/install/global/node_modules/router/lib/route.js:117:3)
  - text: at handle (/home/agent/.local/share/bun/install/global/node_modules/router/index.js:435:11)
  - text: at handleRequest (/home/agent/.local/share/bun/install/global/node_modules/router/lib/layer.js:152:17)
  - text: at <anonymous> (/home/agent/.local/share/bun/install/global/node_modules/router/index.js:295:15)
  - text: at next (/home/agent/.local/share/bun/install/global/node_modules/router/index.js:291:5)
  - text: at error (/home/agent/.local/share/bun/install/global/node_modules/serve-static/index.js:120:7)
  - text: at emitError (node:events:43:23)
  - text: at onStatError (/home/agent/.local/share/bun/install/global/node_modules/send/index.js:315:12)
  - text: at processTicksAndRejections (native:7:39)
```

# Test source

```ts
  1   | /**
  2   |  * E2E Tests: Media Upload Flow
  3   |  * Tests for media library and upload functionality
  4   |  */
  5   | 
  6   | import { test, expect } from '@playwright/test';
  7   | import path from 'path';
  8   | 
  9   | test.describe('Media Upload Flow', () => {
  10  |     test.beforeEach(async ({ page }) => {
  11  |         // Navigate to media library (assumes authenticated session)
  12  |         await page.goto('/media');
  13  |     });
  14  | 
  15  |     test('should display media library grid', async ({ page }) => {
  16  |         // Wait for media library to load
  17  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  18  | 
  19  |         // Check for grid or empty state
  20  |         const mediaGrid = page.locator('[data-testid="media-grid"]');
  21  |         const emptyState = page.locator('[data-testid="empty-state"]');
  22  | 
  23  |         const hasGrid = await mediaGrid.isVisible().catch(() => false);
  24  |         const hasEmpty = await emptyState.isVisible().catch(() => false);
  25  | 
  26  |         expect(hasGrid || hasEmpty).toBeTruthy();
  27  |     });
  28  | 
  29  |     test('should open upload modal', async ({ page }) => {
> 30  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
      |                                                                    ^ Error: expect(locator).toBeVisible() failed
  31  | 
  32  |         // Click upload button
  33  |         const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
  34  |         await uploadBtn.click();
  35  | 
  36  |         // Upload modal should appear
  37  |         await expect(page.locator('[data-testid="upload-modal"]')).toBeVisible();
  38  |     });
  39  | 
  40  |     test('should show drag and drop zone', async ({ page }) => {
  41  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  42  | 
  43  |         const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
  44  |         await uploadBtn.click();
  45  | 
  46  |         // Check for drop zone
  47  |         await expect(page.getByText(/drag.*drop|drop files here/i)).toBeVisible();
  48  |     });
  49  | 
  50  |     test('should handle file upload via input', async ({ page }) => {
  51  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  52  | 
  53  |         const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
  54  |         await uploadBtn.click();
  55  | 
  56  |         // Simulate file input (would need a test file in the repo)
  57  |         const fileInput = page.locator('input[type="file"]');
  58  | 
  59  |         if (await fileInput.isVisible()) {
  60  |             // Create a mock image file
  61  |             await fileInput.setInputFiles({
  62  |                 name: 'test-image.png',
  63  |                 mimeType: 'image/png',
  64  |                 buffer: Buffer.from('fake-image-data'),
  65  |             });
  66  | 
  67  |             // Should show upload progress or success
  68  |             await expect(
  69  |                 page.locator('[data-testid="upload-progress"], [data-testid="upload-success"]')
  70  |             ).toBeVisible({ timeout: 10000 });
  71  |         }
  72  |     });
  73  | 
  74  |     test('should filter media by type', async ({ page }) => {
  75  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  76  | 
  77  |         // Look for filter buttons/tabs
  78  |         const imageFilter = page.locator('[data-testid="filter-images"], [role="tab"]:has-text("Images")');
  79  |         const videoFilter = page.locator('[data-testid="filter-videos"], [role="tab"]:has-text("Videos")');
  80  | 
  81  |         if (await imageFilter.isVisible()) {
  82  |             await imageFilter.click();
  83  | 
  84  |             // Verify only images are shown
  85  |             const mediaItems = page.locator('[data-testid="media-item"]');
  86  |             const count = await mediaItems.count();
  87  | 
  88  |             for (let i = 0; i < Math.min(count, 5); i++) {
  89  |                 const item = mediaItems.nth(i);
  90  |                 const type = await item.getAttribute('data-type');
  91  |                 expect(['image', 'photo', 'picture']).toContain(type?.toLowerCase());
  92  |             }
  93  |         }
  94  |     });
  95  | 
  96  |     test('should search media by name', async ({ page }) => {
  97  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  98  | 
  99  |         // Look for search input
  100 |         const searchInput = page.getByPlaceholder(/search|find/i);
  101 | 
  102 |         if (await searchInput.isVisible()) {
  103 |             await searchInput.fill('product');
  104 | 
  105 |             // Wait for search results
  106 |             await page.waitForTimeout(500); // Debounce
  107 | 
  108 |             // Results should be filtered
  109 |             const mediaItems = page.locator('[data-testid="media-item"]');
  110 |             await expect(mediaItems.first()).toBeVisible({ timeout: 5000 }).catch(() => {
  111 |                 // Empty results is also valid
  112 |             });
  113 |         }
  114 |     });
  115 | 
  116 |     test('should select multiple media items', async ({ page }) => {
  117 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  118 | 
  119 |         const mediaItems = page.locator('[data-testid="media-item"]');
  120 |         const firstItemCount = await mediaItems.count();
  121 | 
  122 |         if (firstItemCount >= 2) {
  123 |             // Enable multi-select mode
  124 |             const multiSelectBtn = page.locator('[data-testid="multi-select-toggle"]');
  125 |             if (await multiSelectBtn.isVisible()) {
  126 |                 await multiSelectBtn.click();
  127 |             }
  128 | 
  129 |             // Select first two items
  130 |             await mediaItems.nth(0).click();
```