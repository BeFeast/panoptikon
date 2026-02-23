import { test as base, expect, Page } from "@playwright/test";

export const PASSWORD = process.env.PANOPTIKON_PASSWORD || "panoptikon";

/**
 * Complete initial setup if needed. Fresh DB requires setup before login.
 * Returns true if setup was performed, false if already configured.
 */
export async function setupIfNeeded(page: Page): Promise<boolean> {
  await page.goto("/login");
  // Server redirects to /setup if not configured
  if (page.url().includes("/setup")) {
    // Fill admin password (both fields)
    await page.locator("#password").fill(PASSWORD);
    await page.locator("#confirm").fill(PASSWORD);
    // VyOS fields are optional, leave empty
    await page.locator('button:has-text("Complete Setup")').click();
    // Should redirect to dashboard after setup
    // Might redirect to login if another worker already completed setup (race)
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 10000 });
    if (page.url().includes("/dashboard")) {
      return true;
    }
    // Another worker completed setup, we need to login now
    return false;
  }
  return false;
}

/** Perform login via the UI and wait for redirect. */
export async function login(page: Page) {
  // First ensure setup is done (might redirect to /setup on fresh DB)
  const didSetup = await setupIfNeeded(page);
  if (didSetup) {
    // Already authenticated after setup
    return;
  }
  // On login page, fill password and sign in
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button:has-text("Sign In")').click();
  await page.waitForURL(/\/(dashboard|agents|devices)/);
}

/** Returns bounding rect of an element. */
export async function rect(page: Page, selector: string) {
  return page.locator(selector).boundingBox();
}

/**
 * Extended Playwright test that provides an `authenticatedPage` fixture.
 * The fixture logs in once before each test, so individual tests don't need
 * to call login() in beforeEach.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
