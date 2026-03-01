import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for the Mesh topology page (/mesh).
 *
 * In a test environment no real Xiaomi router is available, so:
 *  - Without mocking the mesh page shows the error/unavailable state.
 *  - With route-level mocking we test the topology visualization.
 *
 * Settings roundtrip tests for the Xiaomi Mesh settings page are also
 * included to cover IP + password autofill edge cases (#462).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_TOPOLOGY = {
  nodes: [
    {
      ip: "10.10.0.199",
      mac: "AA:BB:CC:DD:EE:01",
      name: "Main Router",
      model: "AX9000",
      hardware: "RD15",
      is_main: true,
      online_devices: 8,
      backhaul_type: "main",
      parent_mac: "",
      signal: 0,
      is_online: true,
    },
    {
      ip: "10.10.0.200",
      mac: "AA:BB:CC:DD:EE:02",
      name: "Living Room",
      model: "AX3000",
      hardware: "RD03",
      is_main: false,
      online_devices: 3,
      backhaul_type: "wired",
      parent_mac: "AA:BB:CC:DD:EE:01",
      signal: 0,
      is_online: true,
    },
    {
      ip: "10.10.0.201",
      mac: "AA:BB:CC:DD:EE:03",
      name: "Bedroom",
      model: "AX3000",
      hardware: "RD03",
      is_main: false,
      online_devices: 2,
      backhaul_type: "wifi",
      parent_mac: "AA:BB:CC:DD:EE:01",
      signal: 1,
      is_online: true,
    },
  ],
  main_ip: "10.10.0.199",
  total_devices: 13,
};

const MOCK_EMPTY_TOPOLOGY = {
  nodes: [],
  main_ip: "10.10.0.199",
  total_devices: 0,
};

// ── Helpers ──────────────────────────────────────────────────

/** Intercept the mesh topology API and return mock data. */
async function mockMeshTopology(page: Page, data: unknown) {
  await page.route("**/api/v1/mesh/topology", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}

/** Intercept the mesh topology API and return a service-unavailable error. */
async function mockMeshTopologyError(page: Page) {
  await page.route("**/api/v1/mesh/topology", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Xiaomi mesh router at 10.10.0.199 is not reachable.",
      }),
    }),
  );
}

// ── Mesh Page Tests ──────────────────────────────────────────

test.describe("Mesh Page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads without errors when integration is disabled (error state)", async ({
    page,
  }) => {
    // In test env with no real router, the API returns an error.
    // The mesh page should show the "Mesh Topology Unavailable" card.
    await page.goto("/mesh/");

    await expect(
      page.getByText("Mesh Topology Unavailable"),
    ).toBeVisible({ timeout: 15000 });

    // Verify the Settings link is present and points to xiaomi-mesh settings
    // Scope to main content to avoid matching the sidebar nav "Settings" link
    const settingsLink = page
      .getByRole("main")
      .getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible();
    await expect(settingsLink).toHaveAttribute(
      "href",
      /\/settings\/xiaomi-mesh\/?/,
    );

    // Retry button should also be visible
    await expect(
      page.getByRole("button", { name: "Retry" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/mesh-unavailable.png",
    });
  });

  test("shows empty state when API returns no nodes", async ({ page }) => {
    await mockMeshTopology(page, MOCK_EMPTY_TOPOLOGY);
    await page.goto("/mesh/");

    // With zero nodes the ReactFlow canvas renders but the stats show 0
    // The toolbar stats line should show "0 nodes"
    await expect(page.getByText("0 nodes")).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/mesh-empty-state.png",
    });
  });

  test("shows mesh nodes when API returns topology data", async ({
    page,
  }) => {
    await mockMeshTopology(page, MOCK_TOPOLOGY);
    await page.goto("/mesh/");

    // Stats toolbar should show correct counts
    await expect(page.getByText("3 nodes")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("3 online")).toBeVisible();
    await expect(page.getByText("13 devices")).toBeVisible();

    // All three node names should be rendered
    await expect(page.getByText("Main Router")).toBeVisible();
    await expect(page.getByText("Living Room")).toBeVisible();
    await expect(page.getByText("Bedroom")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/mesh-with-nodes.png",
    });
  });

  test("node click opens detail panel", async ({ page }) => {
    await mockMeshTopology(page, MOCK_TOPOLOGY);
    await page.goto("/mesh/");

    // Wait for nodes to render
    await expect(page.getByText("Main Router")).toBeVisible({
      timeout: 15000,
    });

    // Click on the "Living Room" node
    await page.getByText("Living Room").click();

    // Detail panel (Sheet) should open with node information
    await expect(
      page.locator('[role="dialog"]').getByText("Living Room"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[role="dialog"]').getByText("10.10.0.200"),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByText("AA:BB:CC:DD:EE:02"),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByText("Satellite"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/mesh-node-detail.png",
    });
  });

  test("error state shows Settings link navigating to xiaomi-mesh settings", async ({
    page,
  }) => {
    await mockMeshTopologyError(page);
    await page.goto("/mesh/");

    await expect(
      page.getByText("Mesh Topology Unavailable"),
    ).toBeVisible({ timeout: 15000 });

    // Click the Settings button (scoped to main content area)
    await page
      .getByRole("main")
      .getByRole("link", { name: "Settings" })
      .click();
    await page.waitForURL(/\/settings\/xiaomi-mesh/, { timeout: 10000 });

    // Verify we're on the xiaomi mesh settings page
    await expect(
      page.getByRole("heading", { name: "Xiaomi Mesh", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/mesh-settings-navigation.png",
    });
  });
});

// ── Settings Page: IP + Password Autofill Tests ──────────────

test.describe("Xiaomi Mesh Settings — IP and Password autofill", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/xiaomi-mesh/");
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
  });

  test("IP field uses autocomplete=one-time-code to prevent autofill", async ({
    page,
  }) => {
    // The IP input should have autocomplete="one-time-code" to prevent
    // browsers from auto-filling it with saved passwords or addresses.
    await expect(page.locator("#xiaomi-ip")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );

    await page.screenshot({
      path: "tests/screenshots/mesh-settings-ip-autocomplete.png",
    });
  });

  test("password field uses autocomplete=new-password to prevent autofill", async ({
    page,
  }) => {
    // The password input should have autocomplete="new-password" to prevent
    // browsers from auto-filling it with saved credentials.
    await expect(page.locator("#xiaomi-password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );

    await page.screenshot({
      path: "tests/screenshots/mesh-settings-password-autocomplete.png",
    });
  });

  test("IP and password save correctly and persist after reload", async ({
    page,
  }) => {
    // Enable the integration — wait for settings to fully load first
    const toggle = page.locator("#xiaomi-enabled");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    // Wait for settings fetch to populate the toggle state
    await page.waitForTimeout(500);
    const currentState = await toggle.getAttribute("aria-checked");
    if (currentState !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true", {
        timeout: 5000,
      });
    }

    // Set a custom IP
    await page.locator("#xiaomi-ip").fill("192.168.31.1");

    // Set a password
    await page.locator("#xiaomi-password").fill("mesh-e2e-password");

    // Save
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });

    // IP should persist
    await expect(page.locator("#xiaomi-ip")).toHaveValue("192.168.31.1");

    // Password should NOT be echoed back (security), but "(saved)" badge shows
    await expect(page.locator("#xiaomi-password")).toHaveValue("");
    await expect(
      page.locator('label[for="xiaomi-password"]'),
    ).toContainText("(saved)");

    await page.screenshot({
      path: "tests/screenshots/mesh-settings-ip-password-persisted.png",
    });
  });
});
