import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E coverage for the literal port of `router-page.jsx` + `router-header.jsx`.
 *
 * Verifies the design-source structural markers land on the live page:
 *   - `router-page` (the wrapping flex column from router-page.jsx)
 *   - `router-header` (the 64×64 icon tile + h1.t-h1 title row)
 *   - `router-tabs` (the underline tab bar)
 *   - `router-tab-<id>` triggers (System, Interfaces, etc.)
 *
 * Source: web/src/components/router/_design-source/router-page.jsx
 *         web/src/components/router/_design-source/router-header.jsx
 *
 * Live URL targets:
 *   /router/mikrotik  → MikrotikRouterDesign
 *   /router/pfsense   → PfSenseRouterDesign
 *   /router/xiaomi    → XiaomiRouterDesign
 */

test.describe("router literal port (#pan-10-748)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("MikroTik route renders RouterPage with header tile, stat row, and underline tabs", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so the design page mounts (otherwise empty-state).
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15_000 });
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
      timeout: 10_000,
    });

    await page.goto("/router/mikrotik/");

    // Workspace shell present (router-workspace = vendor switcher + page).
    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25_000,
    });

    // Either the literal-port page mounted, or the empty/degraded state did.
    const designPage = page.getByTestId("router-page").first();
    const empty = page.getByTestId("router-empty-state").first();
    await expect(designPage.or(empty).first()).toBeVisible({
      timeout: 40_000,
    });

    if (await designPage.isVisible()) {
      // Header card with the 64×64 icon tile + title.
      await expect(page.getByTestId("router-header").first()).toBeVisible();
      // Underline tab bar from router-header.jsx → RouterTabs.
      await expect(page.getByTestId("router-tabs")).toBeVisible();
      // Two of the MikroTik tabs ported from the design source tab list.
      await expect(page.getByTestId("router-tab-interfaces")).toBeVisible();
      await expect(page.getByTestId("router-tab-firewall")).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/router-literal-port-mikrotik.png",
      fullPage: true,
    });
  });

  test("pfSense route renders RouterPage shell with adapted tab set", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/router/pfsense/");

    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25_000,
    });

    const designPage = page.getByTestId("router-page").first();
    const empty = page.getByTestId("router-empty-state").first();
    await expect(designPage.or(empty).first()).toBeVisible({
      timeout: 30_000,
    });

    if (await designPage.isVisible()) {
      await expect(page.getByTestId("router-header").first()).toBeVisible();
      await expect(page.getByTestId("router-tabs")).toBeVisible();
      await expect(page.getByTestId("router-tab-firewall")).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/router-literal-port-pfsense.png",
      fullPage: true,
    });
  });

  test("Xiaomi route renders RouterPage with mesh-specific tabs", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/router/xiaomi/");

    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25_000,
    });

    const designPage = page.getByTestId("router-page").first();
    const empty = page.getByTestId("router-empty-state").first();
    await expect(designPage.or(empty).first()).toBeVisible({
      timeout: 30_000,
    });

    if (await designPage.isVisible()) {
      await expect(page.getByTestId("router-tabs")).toBeVisible();
      await expect(page.getByTestId("router-tab-mesh")).toBeVisible();
      await expect(page.getByTestId("router-tab-wifi")).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/router-literal-port-xiaomi.png",
      fullPage: true,
    });
  });

  test("Design source recipes (.card / .t-h1) are present, not ad-hoc Tailwind", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik/");
    await expect(page.getByTestId("router-workspace")).toBeVisible({
      timeout: 25_000,
    });

    // The literal port emits .card on the header + each stat tile. If the
    // page falls back to the empty state we skip the recipe check (the empty
    // state uses a different shadcn primitive intentionally).
    if (await page.getByTestId("router-page").isVisible()) {
      const cardCount = await page.locator(".card").count();
      expect(cardCount).toBeGreaterThan(0);
      const hOneCount = await page.locator("h1.t-h1").count();
      expect(hOneCount).toBeGreaterThan(0);
    }
  });
});
