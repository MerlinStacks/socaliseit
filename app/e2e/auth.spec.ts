import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests for login, registration, and session management flows
 */

test.describe('Authentication', () => {
    test.beforeEach(async ({ page }) => {
        // Clear any existing sessions
        await page.context().clearCookies();
    });

    test('should display login page', async ({ page }) => {
        await page.goto('/login');

        // Check page title and heading
        await expect(page).toHaveTitle(/SocialiseIT/);
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

        // Check form elements
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByLabel(/password/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto('/login');

        // Click submit without filling form
        await page.getByRole('button', { name: /sign in/i }).click();

        // Should show validation errors
        await expect(page.getByText(/email is required|please enter/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await page.goto('/login');

        // Fill in invalid credentials
        await page.getByLabel(/email/i).fill('invalid@example.com');
        await page.getByLabel(/password/i).fill('wrongpassword');
        await page.getByRole('button', { name: /sign in/i }).click();

        // Should show error message
        await expect(page.getByText(/invalid|incorrect|not found/i)).toBeVisible({
            timeout: 10000,
        });
    });

    test('should navigate to registration page', async ({ page }) => {
        await page.goto('/login');

        // Click register link
        await page.getByRole('link', { name: /register|sign up|create account/i }).click();

        // Should be on register page
        await expect(page).toHaveURL(/register/);
    });

    test('should display registration page', async ({ page }) => {
        await page.goto('/register');

        // Check form elements
        await expect(page.getByLabel(/name/i)).toBeVisible();
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByLabel(/password/i).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /create|register|sign up/i })).toBeVisible();
    });

    test('should validate password requirements', async ({ page }) => {
        await page.goto('/register');

        // Fill form with weak password
        await page.getByLabel(/name/i).fill('Test User');
        await page.getByLabel(/email/i).fill('test@example.com');
        await page.getByLabel(/password/i).first().fill('123');

        // Submit form
        await page.getByRole('button', { name: /create|register|sign up/i }).click();

        // Should show password validation error
        await expect(page.getByText(/password.*characters|too short|weak/i)).toBeVisible();
    });

    test('should have Google OAuth button', async ({ page }) => {
        await page.goto('/login');

        // Check for Google sign-in button
        const googleButton = page.getByRole('button', { name: /google|continue with google/i });
        await expect(googleButton).toBeVisible();
    });
});

test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users from dashboard', async ({ page }) => {
        // Try to access protected route
        await page.goto('/dashboard');

        // Should be redirected to login
        await expect(page).toHaveURL(/login|auth/);
    });

    test('should redirect unauthenticated users from compose', async ({ page }) => {
        await page.goto('/compose');
        await expect(page).toHaveURL(/login|auth/);
    });

    test('should redirect unauthenticated users from settings', async ({ page }) => {
        await page.goto('/settings');
        await expect(page).toHaveURL(/login|auth/);
    });
});

test.describe('Session Management', () => {
    test('should persist session after page reload', async ({ page, context }) => {
        // This test requires a valid test user
        // Skip if no test credentials available
        test.skip(!process.env.TEST_USER_EMAIL, 'Test user credentials not configured');

        await page.goto('/login');

        // Login with test credentials
        await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL!);
        await page.getByLabel(/password/i).fill(process.env.TEST_USER_PASSWORD!);
        await page.getByRole('button', { name: /sign in/i }).click();

        // Wait for redirect to dashboard
        await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

        // Reload page
        await page.reload();

        // Should still be on dashboard
        await expect(page).toHaveURL(/dashboard/);
    });
});
