# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calendar.spec.ts >> Calendar Flow >> should filter posts by platform
- Location: e2e/calendar.spec.ts:71:4

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="calendar-grid"]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "to.be.visible" with timeout 10000ms
  - waiting for locator('[data-testid="calendar-grid"]')

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
  2   |  * E2E Tests: Calendar Flow
  3   |  * Tests for the content calendar scheduling functionality
  4   |  */
  5   | 
  6   | import { test, expect } from '@playwright/test';
  7   | 
  8   | test.describe('Calendar Flow', () => {
  9   |     test.beforeEach(async ({ page }) => {
  10  |         // Navigate to calendar page (assumes authenticated session)
  11  |         await page.goto('/calendar');
  12  |     });
  13  | 
  14  |     test('should display calendar grid', async ({ page }) => {
  15  |         // Wait for calendar to load
  16  |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
  17  | 
  18  |         // Check that day cells are rendered (at least 28 for 4 weeks)
  19  |         const dayCells = page.locator('[data-testid="calendar-day"]');
  20  |         const count = await dayCells.count();
  21  |         expect(count).toBeGreaterThanOrEqual(28);
  22  |     });
  23  | 
  24  |     test('should navigate between months', async ({ page }) => {
  25  |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
  26  | 
  27  |         // Get current month header
  28  |         const monthHeader = page.locator('[data-testid="calendar-month-header"]');
  29  |         const initialMonth = await monthHeader.textContent();
  30  | 
  31  |         // Click next month button
  32  |         await page.click('[data-testid="calendar-next-month"]');
  33  | 
  34  |         // Verify month changed
  35  |         await expect(monthHeader).not.toHaveText(initialMonth || '');
  36  |     });
  37  | 
  38  |     test('should open post details on click', async ({ page }) => {
  39  |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
  40  | 
  41  |         // Look for any scheduled post
  42  |         const scheduledPost = page.locator('[data-testid="calendar-post"]').first();
  43  | 
  44  |         // If there are scheduled posts, click one
  45  |         if (await scheduledPost.isVisible()) {
  46  |             await scheduledPost.click();
  47  | 
  48  |             // Expect post detail modal/panel to open
  49  |             await expect(page.locator('[data-testid="post-detail-modal"]')).toBeVisible();
  50  |         }
  51  |     });
  52  | 
  53  |     test('should drag and drop to reschedule post', async ({ page }) => {
  54  |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
  55  | 
  56  |         const scheduledPost = page.locator('[data-testid="calendar-post"]').first();
  57  | 
  58  |         if (await scheduledPost.isVisible()) {
  59  |             // Get source and target cells
  60  |             const sourceCell = scheduledPost.locator('..'); // Parent cell
  61  |             const targetCell = page.locator('[data-testid="calendar-day"]').nth(5);
  62  | 
  63  |             // Perform drag and drop
  64  |             await scheduledPost.dragTo(targetCell);
  65  | 
  66  |             // Verify toast notification appears
  67  |             await expect(page.locator('[data-testid="toast"]')).toBeVisible();
  68  |         }
  69  |     });
  70  | 
  71  |     test('should filter posts by platform', async ({ page }) => {
> 72  |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
      |                                                                    ^ Error: expect(locator).toBeVisible() failed
  73  | 
  74  |         // Open platform filter
  75  |         const platformFilter = page.locator('[data-testid="platform-filter"]');
  76  |         if (await platformFilter.isVisible()) {
  77  |             await platformFilter.click();
  78  | 
  79  |             // Select Instagram only
  80  |             await page.click('[data-testid="filter-instagram"]');
  81  | 
  82  |             // Verify filter is applied (all visible posts should be Instagram)
  83  |             const visiblePosts = page.locator('[data-testid="calendar-post"]:visible');
  84  |             const count = await visiblePosts.count();
  85  | 
  86  |             for (let i = 0; i < count; i++) {
  87  |                 const post = visiblePosts.nth(i);
  88  |                 await expect(post).toHaveAttribute('data-platform', 'instagram');
  89  |             }
  90  |         }
  91  |     });
  92  | 
  93  |     test('should switch between calendar views', async ({ page }) => {
  94  |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
  95  | 
  96  |         // Check for view toggle buttons
  97  |         const weekViewBtn = page.locator('[data-testid="view-week"]');
  98  |         const dayViewBtn = page.locator('[data-testid="view-day"]');
  99  | 
  100 |         if (await weekViewBtn.isVisible()) {
  101 |             await weekViewBtn.click();
  102 |             await expect(page.locator('[data-testid="calendar-week-view"]')).toBeVisible();
  103 |         }
  104 | 
  105 |         if (await dayViewBtn.isVisible()) {
  106 |             await dayViewBtn.click();
  107 |             await expect(page.locator('[data-testid="calendar-day-view"]')).toBeVisible();
  108 |         }
  109 |     });
  110 | 
  111 |     test('should create new post from calendar', async ({ page }) => {
  112 |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 10000 });
  113 | 
  114 |         // Click on empty day cell
  115 |         const emptyCell = page.locator('[data-testid="calendar-day"]:not(:has([data-testid="calendar-post"]))').first();
  116 | 
  117 |         if (await emptyCell.isVisible()) {
  118 |             await emptyCell.click();
  119 | 
  120 |             // Expect compose modal or redirect to compose page
  121 |             const composeModal = page.locator('[data-testid="quick-compose-modal"]');
  122 |             const composeUrl = page.url();
  123 | 
  124 |             const modalVisible = await composeModal.isVisible().catch(() => false);
  125 |             const redirectedToCompose = composeUrl.includes('/compose');
  126 | 
  127 |             expect(modalVisible || redirectedToCompose).toBeTruthy();
  128 |         }
  129 |     });
  130 | 
  131 |     test('should show loading state while fetching posts', async ({ page }) => {
  132 |         // Intercept API call to delay it
  133 |         await page.route('**/api/posts/scheduled**', async (route) => {
  134 |             await new Promise((r) => setTimeout(r, 1000));
  135 |             await route.continue();
  136 |         });
  137 | 
  138 |         await page.goto('/calendar');
  139 | 
  140 |         // Should show loading skeleton
  141 |         await expect(page.locator('[data-testid="calendar-skeleton"]')).toBeVisible();
  142 | 
  143 |         // Then calendar should appear
  144 |         await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible({ timeout: 15000 });
  145 |     });
  146 | });
  147 | 
```