import { test as base, expect, Page } from "@playwright/test";

export const PASSWORD = process.env.PANOPTIKON_PASSWORD || "panoptikon";

/**
 * Complete initial setup if needed. Fresh DB requires setup before login.
 * Returns true if authentication was completed (either via setup or we're already on dashboard).
 */
export async function setupIfNeeded(page: Page): Promise<boolean> {
  await page.goto("/login");
  
  // Wait for either: login form, setup form, or dashboard (already authenticated)
  await page.waitForURL(/\/(login|setup|dashboard)/, { timeout: 15000 });
  
  // If already on dashboard, we're authenticated
  if (page.url().includes("/dashboard")) {
    return true;
  }
  
  // If on setup page, complete initial setup
  if (page.url().includes("/setup")) {
    // Wait for the setup form to load
    const setupButton = page.locator('button:has-text("Complete Setup")');
    await setupButton.waitFor({ state: "visible", timeout: 10000 });
    
    // Fill admin password (both fields)
    await page.locator("#password").fill(PASSWORD);
    await page.locator("#confirm").fill(PASSWORD);
    // VyOS fields are optional, leave empty
    await setupButton.click();
    
    // Should redirect to dashboard after setup
    // Might redirect to login if another worker already completed setup (race)
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 15000 });
    
    if (page.url().includes("/dashboard")) {
      return true;
    }
    // Another worker completed setup, we need to login now
    return false;
  }
  
  // On login page - not yet authenticated
  return false;
}

/** Perform login via the UI and wait for redirect. */
export async function login(page: Page) {
  // First ensure setup is done (might redirect to /setup on fresh DB)
  const didSetup = await setupIfNeeded(page);
  if (didSetup) {
    // Already authenticated after setup or was already on dashboard
    return;
  }
  
  // On login page - wait for form to load (JS does async auth check first)
  // The page shows skeleton while checking, then renders form
  const passwordInput = page.locator("#password");
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.fill(PASSWORD);
  
  const signInButton = page.locator('button:has-text("Sign In")');
  await signInButton.waitFor({ state: "visible", timeout: 5000 });
  await signInButton.click();
  
  await page.waitForURL(/\/(dashboard|agents|devices)/, { timeout: 15000 });
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
