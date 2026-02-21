import { test as base, expect, Page } from "@playwright/test";

export const PASSWORD = process.env.PANOPTIKON_PASSWORD || "panoptikon";

/** Perform login via the UI and wait for redirect. */
export async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="password"]').fill(PASSWORD);
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
