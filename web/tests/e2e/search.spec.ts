import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for global search functionality (#627).
 *
 * Verifies:
 * - Search input is visible in the top bar
 * - Typing a query shows the search results dropdown
 * - Short queries (< 2 chars) do not trigger search
 * - Results dropdown closes on Escape
 */
test.describe("Global Search (#627)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("search input is visible in the top bar", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search devices/i);
    await expect(searchInput).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/search-input-visible.png",
    });
  });

  test("typing a query opens search results dropdown", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search devices/i);
    await searchInput.click();
    // Type a search term that likely won't match anything in test DB
    await searchInput.fill("test-search-query");

    // Wait for the debounce (300ms) + API call
    await page.waitForTimeout(500);

    // The dropdown should appear — either with results or "No results" message
    const dropdown = page.locator(".absolute.left-0.right-0.top-full");
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: "tests/screenshots/search-dropdown-open.png",
    });
  });

  test("short query does not open dropdown", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search devices/i);
    await searchInput.click();
    await searchInput.fill("a"); // single char — too short

    await page.waitForTimeout(500);

    // Dropdown should NOT appear for single-character queries
    const dropdown = page.locator(".absolute.left-0.right-0.top-full");
    await expect(dropdown).not.toBeVisible();
  });

  test("Escape closes search dropdown", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search devices/i);
    await searchInput.click();
    await searchInput.fill("test-query");

    await page.waitForTimeout(500);

    const dropdown = page.locator(".absolute.left-0.right-0.top-full");
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(dropdown).not.toBeVisible({ timeout: 2000 });

    await page.screenshot({
      path: "tests/screenshots/search-dropdown-closed.png",
    });
  });

  test("search API returns valid response structure", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Intercept the search API call to verify response structure
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/search?q="),
    );

    const searchInput = page.getByPlaceholder(/search devices/i);
    await searchInput.fill("test");

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Verify the response has all expected fields (arrays)
    expect(body).toHaveProperty("devices");
    expect(body).toHaveProperty("agents");
    expect(body).toHaveProperty("alerts");
    expect(body).toHaveProperty("ssh_targets");
    expect(body).toHaveProperty("assets");
    expect(Array.isArray(body.devices)).toBe(true);
    expect(Array.isArray(body.agents)).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(Array.isArray(body.ssh_targets)).toBe(true);
    expect(Array.isArray(body.assets)).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/search-api-response.png",
    });
  });
});
