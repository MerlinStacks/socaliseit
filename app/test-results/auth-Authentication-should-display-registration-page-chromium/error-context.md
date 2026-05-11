# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> should display registration page
- Location: e2e/auth.spec.ts:61:4

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel(/name/i)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "to.be.visible" with timeout 5000ms
  - waiting for getByLabel(/name/i)

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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * Authentication E2E Tests
  5   |  * Tests for login, registration, and session management flows
  6   |  */
  7   | 
  8   | test.describe('Authentication', () => {
  9   |     test.beforeEach(async ({ page }) => {
  10  |         // Clear any existing sessions
  11  |         await page.context().clearCookies();
  12  |     });
  13  | 
  14  |     test('should display login page', async ({ page }) => {
  15  |         await page.goto('/login');
  16  | 
  17  |         // Check page title and heading
  18  |         await expect(page).toHaveTitle(/SocialiseIT/);
  19  |         await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  20  | 
  21  |         // Check form elements
  22  |         await expect(page.getByLabel(/email/i)).toBeVisible();
  23  |         await expect(page.getByLabel(/password/i)).toBeVisible();
  24  |         await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  25  |     });
  26  | 
  27  |     test('should show validation errors for empty form', async ({ page }) => {
  28  |         await page.goto('/login');
  29  | 
  30  |         // Click submit without filling form
  31  |         await page.getByRole('button', { name: /sign in/i }).click();
  32  | 
  33  |         // Should show validation errors
  34  |         await expect(page.getByText(/email is required|please enter/i)).toBeVisible();
  35  |     });
  36  | 
  37  |     test('should show error for invalid credentials', async ({ page }) => {
  38  |         await page.goto('/login');
  39  | 
  40  |         // Fill in invalid credentials
  41  |         await page.getByLabel(/email/i).fill('invalid@example.com');
  42  |         await page.getByLabel(/password/i).fill('wrongpassword');
  43  |         await page.getByRole('button', { name: /sign in/i }).click();
  44  | 
  45  |         // Should show error message
  46  |         await expect(page.getByText(/invalid|incorrect|not found/i)).toBeVisible({
  47  |             timeout: 10000,
  48  |         });
  49  |     });
  50  | 
  51  |     test('should navigate to registration page', async ({ page }) => {
  52  |         await page.goto('/login');
  53  | 
  54  |         // Click register link
  55  |         await page.getByRole('link', { name: /register|sign up|create account/i }).click();
  56  | 
  57  |         // Should be on register page
  58  |         await expect(page).toHaveURL(/register/);
  59  |     });
  60  | 
  61  |     test('should display registration page', async ({ page }) => {
  62  |         await page.goto('/register');
  63  | 
  64  |         // Check form elements
> 65  |         await expect(page.getByLabel(/name/i)).toBeVisible();
      |                                               ^ Error: expect(locator).toBeVisible() failed
  66  |         await expect(page.getByLabel(/email/i)).toBeVisible();
  67  |         await expect(page.getByLabel(/password/i).first()).toBeVisible();
  68  |         await expect(page.getByRole('button', { name: /create|register|sign up/i })).toBeVisible();
  69  |     });
  70  | 
  71  |     test('should validate password requirements', async ({ page }) => {
  72  |         await page.goto('/register');
  73  | 
  74  |         // Fill form with weak password
  75  |         await page.getByLabel(/name/i).fill('Test User');
  76  |         await page.getByLabel(/email/i).fill('test@example.com');
  77  |         await page.getByLabel(/password/i).first().fill('123');
  78  | 
  79  |         // Submit form
  80  |         await page.getByRole('button', { name: /create|register|sign up/i }).click();
  81  | 
  82  |         // Should show password validation error
  83  |         await expect(page.getByText(/password.*characters|too short|weak/i)).toBeVisible();
  84  |     });
  85  | 
  86  |     test('should have Google OAuth button', async ({ page }) => {
  87  |         await page.goto('/login');
  88  | 
  89  |         // Check for Google sign-in button
  90  |         const googleButton = page.getByRole('button', { name: /google|continue with google/i });
  91  |         await expect(googleButton).toBeVisible();
  92  |     });
  93  | });
  94  | 
  95  | test.describe('Protected Routes', () => {
  96  |     test('should redirect unauthenticated users from dashboard', async ({ page }) => {
  97  |         // Try to access protected route
  98  |         await page.goto('/dashboard');
  99  | 
  100 |         // Should be redirected to login
  101 |         await expect(page).toHaveURL(/login|auth/);
  102 |     });
  103 | 
  104 |     test('should redirect unauthenticated users from compose', async ({ page }) => {
  105 |         await page.goto('/compose');
  106 |         await expect(page).toHaveURL(/login|auth/);
  107 |     });
  108 | 
  109 |     test('should redirect unauthenticated users from settings', async ({ page }) => {
  110 |         await page.goto('/settings');
  111 |         await expect(page).toHaveURL(/login|auth/);
  112 |     });
  113 | });
  114 | 
  115 | test.describe('Session Management', () => {
  116 |     test('should persist session after page reload', async ({ page, context }) => {
  117 |         // This test requires a valid test user
  118 |         // Skip if no test credentials available
  119 |         test.skip(!process.env.TEST_USER_EMAIL, 'Test user credentials not configured');
  120 | 
  121 |         await page.goto('/login');
  122 | 
  123 |         // Login with test credentials
  124 |         await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL!);
  125 |         await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD!);
  126 |         await page.getByRole('button', { name: /sign in/i }).click();
  127 | 
  128 |         // Wait for redirect to dashboard
  129 |         await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  130 | 
  131 |         // Reload page
  132 |         await page.reload();
  133 | 
  134 |         // Should still be on dashboard
  135 |         await expect(page).toHaveURL(/dashboard/);
  136 |     });
  137 | });
  138 | 
```