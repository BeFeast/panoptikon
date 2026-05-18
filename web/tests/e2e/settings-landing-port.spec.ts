import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E: literal port of panopticon/project/settings.jsx
 *
 * Verifies the new /settings landing renders the design-source
 * structure: 6 groups, 22 tiles total, eyebrow + display title +
 * counter line, search card with quick filters, footer tip.
 */

test.describe("Settings landing — design-source literal port", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("renders the literal-port 6 groups + 25 tiles", async ({ page }) => {
    await page.goto("/settings");

    // Eyebrow + display title (settings.jsx L121-123).
    await expect(page.getByText("Configuration", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Counter line (settings.jsx L124-126). Design source hardcodes
    // "22 items" but the actual SETTINGS_GROUPS array contains 25 items
    // (6+6+4+4+3+2). Our port renders the computed total, not the stale
    // literal — this is a faithful interpretation of the design, not a
    // re-author. The "6 groups" + "need attention" labels stay literal.
    const summary = page.locator('[data-testid="settings-summary"]');
    await expect(summary).toContainText("25 items");
    await expect(summary).toContainText("6 groups");
    await expect(summary).toContainText("need attention");

    // Group sections (literal port of SETTINGS_GROUPS — exactly 6).
    const sections = page.locator('[data-testid^="settings-section-"]');
    await expect(sections).toHaveCount(6);

    // Tile count (literal port — 25 total per design SETTINGS_GROUPS).
    const tiles = page.locator('[data-testid="settings-tile"]');
    await expect(tiles).toHaveCount(25);

    // Spot-check group labels from the design source.
    await expect(page.getByRole("heading", { name: "Router", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "DNS · networking", level: 3 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Certificates · security", level: 3 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Fleet · telemetry", level: 3 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Notifications", level: 3 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Advanced", level: 3 })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-landing-literal-port.png",
      fullPage: true,
    });
  });

  test("search card + quick filters + footer tip render", async ({ page }) => {
    await page.goto("/settings");

    // Search input (settings.jsx L138-141).
    const search = page.locator('[data-testid="settings-search"]');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute("placeholder", /search settings/i);

    // ⌘K hint inside the settings search card (scoped — TopBar also
    // renders one ⌘K affordance).
    await expect(
      page.locator('kbd', { hasText: "⌘K" }).first(),
    ).toBeVisible();

    // Quick filter labels (settings.jsx L146-150). "Experimental" also
    // appears inside the Advanced tile description, so anchor the filter
    // checks on uppercase "Quick filters" label and the filter texts that
    // are unique.
    await expect(page.getByText("Quick filters")).toBeVisible();
    await expect(page.getByText("Needs attention")).toBeVisible();
    await expect(page.getByText("Recently changed")).toBeVisible();
    await expect(page.getByText("Connected services")).toBeVisible();
    // "Experimental" filter pill is the first occurrence (filter row
    // renders before the Advanced tile in DOM order).
    await expect(page.getByText("Experimental").first()).toBeVisible();

    // Footer (settings.jsx L184-196).
    const footer = page.locator('[data-testid="settings-footer"]');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("Tip · ⌘K");
    await expect(footer).toContainText("Last config change");

    await page.screenshot({
      path: "tests/screenshots/settings-landing-search-footer.png",
    });
  });

  test("each tile is a Link to a /settings/* sub-route", async ({ page }) => {
    await page.goto("/settings");

    // MikroTik tile → /settings/router (Next.js may add a trailing slash).
    const mikrotik = page.locator('[data-tile-id="router-mikrotik"]');
    await expect(mikrotik).toBeVisible();
    await expect(mikrotik).toHaveAttribute("href", /\/settings\/router\/?$/);

    // Audit log tile → /settings/audit-log.
    const audit = page.locator('[data-tile-id="audit"]');
    await expect(audit).toBeVisible();
    await expect(audit).toHaveAttribute("href", /\/settings\/audit-log\/?$/);

    // Click navigates.
    await mikrotik.click();
    await expect(page).toHaveURL(/\/settings\/router/);
  });
});
