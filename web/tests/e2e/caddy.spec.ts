import {
  test,
  expect,
  login,
  createCaddyHost,
} from "../../e2e/fixtures";

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

    await createCaddyHost(page, domain, "10.0.0.5", "8080");

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

    await createCaddyHost(page, domain, "10.0.0.99", "443");

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

  test("certificate probe settings save and reload roundtrip", async ({
    page,
  }) => {
    const host = page.locator("#cert-probe-host");
    const interval = page.locator("#cert-probe-interval");
    const threshold = page.locator("#cert-expiry-threshold");
    await expect(host).toBeVisible({ timeout: 15000 });

    await host.fill("127.0.0.1");
    await interval.fill("3600");
    await threshold.fill("21");
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Caddy admin URL saved")).toBeVisible();

    await page.reload();
    await expect(page.locator("#cert-probe-host")).toHaveValue("127.0.0.1", {
      timeout: 15000,
    });
    await expect(page.locator("#cert-probe-interval")).toHaveValue("3600");
    await expect(page.locator("#cert-expiry-threshold")).toHaveValue("21");
    await page.screenshot({
      path: "tests/screenshots/caddy-probe-settings-roundtrip.png",
      fullPage: true,
    });

    await page.locator("#cert-probe-host").fill("");
    await page.locator("#cert-probe-interval").fill("21600");
    await page.locator("#cert-expiry-threshold").fill("14");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Caddy admin URL saved")).toBeVisible();
  });

  test("search filters domain list", async ({ page }) => {
    const uniqueTag = Date.now();
    const domain1 = `search-alpha-${uniqueTag}.example.com`;
    const domain2 = `search-bravo-${uniqueTag}.example.com`;

    // Create two hosts (each create can take ~10s due to Caddy sync timeout)
    await createCaddyHost(page, domain1, "10.0.0.1", "80");
    await expect(page.getByRole("link", { name: domain1 })).toBeVisible({
      timeout: 10000,
    });

    await createCaddyHost(page, domain2, "10.0.0.2", "80");
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
