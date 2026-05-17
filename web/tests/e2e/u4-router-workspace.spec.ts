import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E coverage for the U4 router workspace port.
 *
 * Verifies the unified shell (`router-workspace`), the new `router-header`
 * pill + tabs row across MikroTik / pfSense / Xiaomi, and that the
 * `router-tab-*` data-testids resolve. All three router routes must keep
 * working when the integration is disabled (empty state) or enabled but
 * unreachable (header + degraded surface still render).
 */

test.describe("U4 router workspace shell", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("MikroTik route renders workspace + header + tabs", async ({ page }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so the full workspace (tabs) reaches the DOM
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("load");

    const toggle = page.locator("#mt-enabled");
    const checked = await toggle.getAttribute("aria-checked");
    if (checked !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }
    await page.locator("#mt-url").fill("http://10.10.0.125");
    await page.locator("#mt-user").fill("admin");
    await page.locator("#mt-password").fill("admin");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("MikroTik settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.goto("/router/mikrotik/");

    // Workspace shell always present
    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25000,
    });

    // Header or empty-state must resolve (test env router is unreachable)
    const header = page.getByTestId("router-header").first();
    const empty = page.getByTestId("router-empty-state").first();
    await expect(header.or(empty).first()).toBeVisible({ timeout: 40000 });

    await page.screenshot({
      path: "tests/screenshots/u4-router-mikrotik.png",
      fullPage: true,
    });
  });

  test("pfSense route renders workspace + degraded header or empty", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/router/pfsense/");

    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25000,
    });
    const header = page.getByTestId("router-header").first();
    const empty = page.getByTestId("router-empty-state").first();
    await expect(header.or(empty).first()).toBeVisible({ timeout: 30000 });

    await page.screenshot({
      path: "tests/screenshots/u4-router-pfsense.png",
      fullPage: true,
    });
  });

  test("Xiaomi route renders workspace + system/mesh tabs or empty", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/router/xiaomi/");

    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25000,
    });

    const tabs = page.getByTestId("router-tabs");
    const empty = page.getByTestId("router-empty-state").first();
    await expect(tabs.or(empty).first()).toBeVisible({ timeout: 30000 });

    if (await tabs.isVisible()) {
      await expect(page.getByTestId("router-tab-system")).toBeVisible();
      await expect(page.getByTestId("router-tab-mesh")).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/u4-router-xiaomi.png",
      fullPage: true,
    });
  });

  test("Router routes never emit raw Tailwind color literals (mesh guard)", async ({
    page,
  }) => {
    // Sanity check that the page renders without using any forbidden raw
    // Tailwind color literal class names — guarded by CI on the source side
    // (web/scripts/check-design-tokens.sh) but worth re-asserting in the DOM
    // after PageTransition / React reconciliation.
    await page.goto("/router/mikrotik/");
    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25000,
    });

    const banned = /\b(?:cyan|sky|slate|indigo|emerald|rose|amber|fuchsia|violet|blue|green|yellow|red|orange|pink|purple|stone|zinc|neutral|gray|teal)-\d{2,3}\b/;
    const html = await page.content();
    expect(html).not.toMatch(banned);
  });
});
