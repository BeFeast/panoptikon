import { Page } from "@playwright/test";

export const BASE = "http://10.10.0.14:8080";
export const PASSWORD = "panoptikon";

export async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button:has-text("Sign In")').click();
  await page.waitForURL(/\/(dashboard|agents|devices)/);
}

/** Returns bounding rect of an element */
export async function rect(page: Page, selector: string) {
  return page.locator(selector).boundingBox();
}
