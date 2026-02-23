import { test as base, expect, Page } from "@playwright/test";

export const PASSWORD = process.env.PANOPTIKON_PASSWORD || "panoptikon";

/**
 * Complete initial setup if needed. Fresh DB requires setup before login.
 * Returns true if authentication was completed (either via setup or we're already on dashboard).
 */
export async function setupIfNeeded(page: Page): Promise<boolean> {
  await page.goto("/login");
  
  // Wait for either the Sign In button (login page ready) or Complete Setup button (setup page ready)
  // or dashboard content. This handles client-side redirects after auth status check.
  const signInButton = page.getByRole('button', { name: 'Sign In' });
  const setupButton = page.getByRole('button', { name: 'Complete Setup' });
  const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', level: 1 });
  
  // Wait for one of these to appear (whichever page we end up on)
  await Promise.race([
    signInButton.waitFor({ state: "visible", timeout: 20000 }),
    setupButton.waitFor({ state: "visible", timeout: 20000 }),
    dashboardHeading.waitFor({ state: "visible", timeout: 20000 }),
  ]);
  
  // Now check which page we're on
  if (await dashboardHeading.isVisible()) {
    // Already authenticated
    return true;
  }
  
  if (await setupButton.isVisible()) {
    // On setup page - complete initial setup
    await page.locator("#password").fill(PASSWORD);
    await page.locator("#confirm").fill(PASSWORD);
    await setupButton.click();
    
    // Should redirect to dashboard after setup
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 15000 });
    
    if (page.url().includes("/dashboard")) {
      return true;
    }
    // Another worker completed setup (race), need to login now
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
    return;
  }
  
  // On login page - form is already visible (setupIfNeeded waited for Sign In button)
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  
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
