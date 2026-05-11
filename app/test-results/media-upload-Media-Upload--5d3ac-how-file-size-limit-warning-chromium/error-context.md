# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-upload.spec.ts >> Media Upload Validation >> should show file size limit warning
- Location: e2e/media-upload.spec.ts:243:4

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
  218 | test.describe('Media Upload Validation', () => {
  219 |     test.beforeEach(async ({ page }) => {
  220 |         await page.goto('/media');
  221 |     });
  222 | 
  223 |     test('should reject invalid file types', async ({ page }) => {
  224 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
  225 | 
  226 |         const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
  227 |         await uploadBtn.click();
  228 | 
  229 |         const fileInput = page.locator('input[type="file"]');
  230 | 
  231 |         if (await fileInput.isVisible()) {
  232 |             await fileInput.setInputFiles({
  233 |                 name: 'test.exe',
  234 |                 mimeType: 'application/x-executable',
  235 |                 buffer: Buffer.from('fake-data'),
  236 |             });
  237 | 
  238 |             // Error message should appear
  239 |             await expect(page.getByText(/not allowed|invalid|unsupported/i)).toBeVisible();
  240 |         }
  241 |     });
  242 | 
  243 |     test('should show file size limit warning', async ({ page }) => {
> 244 |         await expect(page.locator('[data-testid="media-library"]')).toBeVisible({ timeout: 10000 });
      |                                                                    ^ Error: expect(locator).toBeVisible() failed
  245 | 
  246 |         const uploadBtn = page.getByRole('button', { name: /upload|add media/i });
  247 |         await uploadBtn.click();
  248 | 
  249 |         // Check for file size limit info
  250 |         await expect(page.getByText(/max.*mb|size limit|maximum/i)).toBeVisible();
  251 |     });
  252 | });
  253 | 
```