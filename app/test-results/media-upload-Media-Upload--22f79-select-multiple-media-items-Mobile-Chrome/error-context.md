# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-upload.spec.ts >> Media Upload Flow >> should select multiple media items
- Location: e2e/media-upload.spec.ts:116:4

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
  30  |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
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
> 117 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
      |                                                                    ^ Error: expect(locator).toBeVisible() failed
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
  131 |             await mediaItems.nth(1).click();
  132 | 
  133 |             // Selection count should appear
  134 |             await expect(page.getByText(/2 selected|selected: 2/i)).toBeVisible();
  135 |         }
  136 |     });
  137 | 
  138 |     test('should preview media on click', async ({ page }) => {
  139 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  140 | 
  141 |         const mediaItems = page.locator('[data-testid="media-item"]');
  142 | 
  143 |         if (await mediaItems.first().isVisible()) {
  144 |             await mediaItems.first().click();
  145 | 
  146 |             // Preview modal or panel should appear
  147 |             const preview = page.locator('[data-testid="media-preview"], [data-testid="media-detail"]');
  148 |             await expect(preview).toBeVisible({ timeout: 5000 });
  149 |         }
  150 |     });
  151 | 
  152 |     test('should show file details', async ({ page }) => {
  153 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  154 | 
  155 |         const mediaItems = page.locator('[data-testid="media-item"]');
  156 | 
  157 |         if (await mediaItems.first().isVisible()) {
  158 |             // Right-click or hover for details
  159 |             await mediaItems.first().click({ button: 'right' });
  160 | 
  161 |             // Context menu or details panel should show
  162 |             const details = page.locator('[data-testid="context-menu"], [data-testid="media-details"]');
  163 | 
  164 |             if (await details.isVisible()) {
  165 |                 await expect(page.getByText(/size|dimension|type|uploaded/i)).toBeVisible();
  166 |             }
  167 |         }
  168 |     });
  169 | 
  170 |     test('should handle delete media', async ({ page }) => {
  171 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  172 | 
  173 |         const mediaItems = page.locator('[data-testid="media-item"]');
  174 | 
  175 |         if (await mediaItems.first().isVisible()) {
  176 |             // Select first item
  177 |             await mediaItems.first().click();
  178 | 
  179 |             // Look for delete button
  180 |             const deleteBtn = page.getByRole('button', { name: /delete|remove/i });
  181 | 
  182 |             if (await deleteBtn.isVisible()) {
  183 |                 await deleteBtn.click();
  184 | 
  185 |                 // Confirmation dialog should appear
  186 |                 await expect(page.getByText(/confirm|are you sure/i)).toBeVisible();
  187 |             }
  188 |         }
  189 |     });
  190 | 
  191 |     test('should show upload progress bar', async ({ page }) => {
  192 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  193 | 
  194 |         // Intercept upload to slow it down
  195 |         await page.route('**/api/media/upload**', async (route) => {
  196 |             await new Promise((r) => setTimeout(r, 2000));
  197 |             await route.fulfill({ status: 200, body: JSON.stringify({ id: 'test', url: '/test.png' }) });
  198 |         });
  199 | 
  200 |         const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
  201 |         await uploadBtn.click();
  202 | 
  203 |         const fileInput = page.locator('input[type="file"]');
  204 | 
  205 |         if (await fileInput.isVisible()) {
  206 |             await fileInput.setInputFiles({
  207 |                 name: 'test-upload.png',
  208 |                 mimeType: 'image/png',
  209 |                 buffer: Buffer.from('test-data'),
  210 |             });
  211 | 
  212 |             // Progress bar should be visible during upload
  213 |             await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible({ timeout: 1000 });
  214 |         }
  215 |     });
  216 | });
  217 | 
```