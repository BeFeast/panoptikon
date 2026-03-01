import { test, expect, login } from "../../e2e/fixtures";

/**
 * Helper: create a proxy host via the Add Host dialog.
 * Waits for the dialog to close (up to 20s, since sync_to_caddy can
 * block ~10s when Caddy is unreachable).
 */
async function createHost(
  page: import("@playwright/test").Page,
  domain: string,
  host: string,
  port: string,
) {
  await page.getByRole("button", { name: "Add Host" }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
  await page.locator("#domain").fill(domain);
  await page.locator("#forward-host").fill(host);
  await page.locator("#forward-port").fill(port);
  await page.getByRole("button", { name: "Create" }).click();
  // sync_to_caddy may block ~10s when Caddy is unreachable
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({
    timeout: 20000,
  });
}

test.describe("Caddy Reverse Proxy page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/caddy/");
    await expect(
      page.getByRole("heading", { name: "Caddy Reverse Proxy", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("page loads with heading and key UI elements", async ({ page }) => {
    // Admin URL card
    await expect(page.locator("#admin-url")).toBeVisible();

    // Action buttons
    await expect(
      page.getByRole("button", { name: "Test Connection" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sync to Caddy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Host" }),
    ).toBeVisible();

    // Search input
    await expect(
      page.getByPlaceholder("Filter by domain or upstream..."),
    ).toBeVisible();

    // Table headers
    await expect(
      page.getByRole("columnheader", { name: "Domain" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Upstream" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "TLS" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Status" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Actions" }),
    ).toBeVisible();

    await page.screenshot({ path: "tests/screenshots/caddy-page.png" });
  });

  test("domain list renders after adding a host", async ({ page }) => {
    const domain = `e2e-${Date.now()}.example.com`;

    await createHost(page, domain, "10.0.0.5", "8080");

    // Domain should appear as a link in the table
    const link = page.getByRole("link", { name: domain });
    await expect(link).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/caddy-domain-list.png",
      fullPage: true,
    });
  });

  test("add domain form validates required fields", async ({ page }) => {
    // Open Add Host dialog
    await page.getByRole("button", { name: "Add Host" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    // Submit with empty domain
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Domain is required")).toBeVisible({
      timeout: 5000,
    });

    await page.screenshot({
      path: "tests/screenshots/caddy-validation-domain.png",
    });

    // Fill domain but leave forward host empty
    await page.locator("#domain").fill("test.example.com");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Forward host is required")).toBeVisible({
      timeout: 5000,
    });

    await page.screenshot({
      path: "tests/screenshots/caddy-validation-host.png",
    });
  });

  test("domain link is clickable with correct href (#436/#442)", async ({
    page,
  }) => {
    const domain = `link-test-${Date.now()}.example.com`;

    await createHost(page, domain, "10.0.0.99", "443");

    // Verify the domain is rendered as a clickable <a> tag
    const link = page.getByRole("link", { name: domain });
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveAttribute("href", `https://${domain}`);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);

    await page.screenshot({
      path: "tests/screenshots/caddy-domain-link.png",
    });
  });

  test("admin URL save and reload roundtrip", async ({ page }) => {
    // Wait for settings to load (admin URL gets populated from API)
    await expect(page.locator("#admin-url")).toBeVisible({ timeout: 15000 });

    const testUrl = "http://192.168.1.100:2019";
    await page.locator("#admin-url").fill(testUrl);

    const saveBtn = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
    await saveBtn.click();

    await expect(page.getByText("Caddy admin URL saved")).toBeVisible({
      timeout: 10000,
    });

    // Reload and verify persistence — settings fetch may take a moment
    await page.reload();
    await expect(page.locator("#admin-url")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#admin-url")).toHaveValue(testUrl, {
      timeout: 15000,
    });

    await page.screenshot({
      path: "tests/screenshots/caddy-admin-url-persisted.png",
    });

    // Restore default to avoid interfering with other tests
    await page.locator("#admin-url").fill("http://localhost:2019");
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
    await saveBtn.click();
    await expect(page.getByText("Caddy admin URL saved")).toBeVisible({
      timeout: 10000,
    });
  });

  test("search filters domain list", async ({ page }) => {
    const uniqueTag = Date.now();
    const domain1 = `search-alpha-${uniqueTag}.example.com`;
    const domain2 = `search-bravo-${uniqueTag}.example.com`;

    // Create two hosts (each create can take ~10s due to Caddy sync timeout)
    await createHost(page, domain1, "10.0.0.1", "80");
    await expect(page.getByRole("link", { name: domain1 })).toBeVisible({
      timeout: 10000,
    });

    await createHost(page, domain2, "10.0.0.2", "80");
    await expect(page.getByRole("link", { name: domain2 })).toBeVisible({
      timeout: 10000,
    });

    // Filter for alpha — only domain1 should be visible
    await page
      .getByPlaceholder("Filter by domain or upstream...")
      .fill("alpha");
    await expect(page.getByRole("link", { name: domain1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: domain2 }),
    ).not.toBeVisible();

    // Filter for bravo — only domain2 should be visible
    await page
      .getByPlaceholder("Filter by domain or upstream...")
      .fill("bravo");
    await expect(page.getByRole("link", { name: domain2 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: domain1 }),
    ).not.toBeVisible();

    // Non-matching filter
    await page
      .getByPlaceholder("Filter by domain or upstream...")
      .fill("zzzznonexistent");
    await expect(
      page.getByText("No hosts match your filter."),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/caddy-search-filter.png",
    });
  });
});
