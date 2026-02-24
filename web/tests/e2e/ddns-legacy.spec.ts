import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

async function enableLegacyVyos(page: Page) {
  const response = await page.request.patch("/api/v1/settings", {
    data: {
      show_legacy_routers: true,
      vyos_url: "http://vyos.local",
      vyos_api_key: "test-api-key",
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function disableLegacyVyos(page: Page) {
  const response = await page.request.patch("/api/v1/settings", {
    data: {
      show_legacy_routers: false,
      vyos_url: "",
      vyos_api_key: "",
    },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("Settings page — legacy section visibility", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
  });

  test("shows Legacy / Optional section heading", async ({ page }) => {
    await expect(
      page.getByText("Legacy / Optional", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("NPM card is inside the Legacy / Optional section", async ({
    page,
  }) => {
    const legacyHeading = page.getByText("Legacy / Optional", { exact: true });
    await expect(legacyHeading).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Nginx Proxy Manager")).toBeVisible();
    await expect(
      page.getByText("Legacy reverse proxy — consider migrating to Caddy."),
    ).toBeVisible();
  });

  test("Caddy subtitle guides users away from legacy", async ({ page }) => {
    await expect(
      page.getByText("Use Caddy for new deployments."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("NPM is not in the Integrations section", async ({ page }) => {
    const integrationsHeading = page.getByText("Integrations", { exact: true });
    await expect(integrationsHeading).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText(/Configure MikroTik( or VyOS)? router integration\./),
    ).toBeVisible();
    await expect(
      page.getByText("Primary reverse proxy — manage hosts via Caddy."),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-legacy-section.png",
      fullPage: true,
    });
  });
});

test.describe("DDNS page — MikroTik default selection", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/ddns");
  });

  test("page loads with Dynamic DNS heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("Add Entry dialog hides Router Type selector when legacy routers are off", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Entry" }).click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(
      dialog.locator("label").filter({ hasText: "Router Type" }),
    ).toHaveCount(0);
    await expect(dialog.locator('option[value="vyos"]')).toHaveCount(0);
  });

  test("Add Entry dialog defaults Router Type to MikroTik when legacy routers are enabled", async ({
    page,
  }) => {
    await enableLegacyVyos(page);
    try {
      await page.goto("/ddns");
      await page.getByRole("button", { name: "Add Entry" }).click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 5000,
      });

      const routerSelect = page
        .locator('[role="dialog"]')
        .locator("select")
        .filter({ has: page.locator('option[value="mikrotik"]') });
      await expect(routerSelect).toHaveValue("mikrotik");

      await page.screenshot({
        path: "tests/screenshots/ddns-add-dialog-mikrotik-default.png",
      });
    } finally {
      await disableLegacyVyos(page);
    }
  });

  test("VyOS is available as a router type option in the selector when legacy routers are enabled", async ({
    page,
  }) => {
    await enableLegacyVyos(page);
    try {
      await page.goto("/ddns");
      await page.getByRole("button", { name: "Add Entry" }).click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 5000,
      });

      const vyosOption = page
        .locator('[role="dialog"]')
        .locator('option[value="vyos"]');
      await expect(vyosOption).toBeAttached();
      await expect(vyosOption).toHaveText("VyOS (Legacy)");
    } finally {
      await disableLegacyVyos(page);
    }
  });

  test("MikroTik is the first option in the Router Type selector", async ({
    page,
  }) => {
    await enableLegacyVyos(page);
    try {
      await page.goto("/ddns");
      await page.getByRole("button", { name: "Add Entry" }).click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 5000,
      });

      const routerSelect = page
        .locator('[role="dialog"]')
        .locator("select")
        .filter({ has: page.locator('option[value="mikrotik"]') });
      const firstOption = routerSelect.locator("option").first();
      await expect(firstOption).toHaveAttribute("value", "mikrotik");
      await expect(firstOption).toHaveText("MikroTik");

      await page.screenshot({
        path: "tests/screenshots/ddns-router-type-options.png",
      });
    } finally {
      await disableLegacyVyos(page);
    }
  });
});
