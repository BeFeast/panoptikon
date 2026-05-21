import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * Regression tests for #807 — Mesh topology should render correct Wi-Fi
 * names/roles.
 *
 * The bug: Xiaomi BE3600 firmware reports `locale: "default"` for satellite
 * mesh nodes whose label hasn't been customised in the MiWiFi app. The
 * cards-only redesign collapsed every such node to "default", losing the
 * real per-node `name` (e.g. `Live Studio`, `Basement`, `Floor 2`). After
 * the fix, the topology must render the real `name` and an SVG mesh map
 * (not just generic repeated cards).
 */

const XIAOMI_TOPOLOGY_WITH_DEFAULT_LOCALE = {
  // Mirrors the screenshot from the issue: one user-labelled satellite
  // ("Live Studio") plus several whose locale is the firmware placeholder
  // "default" but whose `name` is actually set.
  nodes: [
    {
      mac: "AA:BB:CC:00:00:01",
      name: "OK Home",
      locale: "default",
      ip: "10.10.0.199",
      online: 8,
      hardware: "RD15",
      model: null,
    },
    {
      mac: "AA:BB:CC:00:00:02",
      name: "Live Studio",
      locale: "Live Studio",
      ip: "10.10.0.52",
      online: 5,
      hardware: "RD03",
      model: null,
    },
    {
      mac: "AA:BB:CC:00:00:03",
      name: "Basement",
      locale: "default",
      ip: "10.10.0.53",
      online: 4,
      hardware: "RD03",
      model: null,
    },
    {
      mac: "AA:BB:CC:00:00:04",
      name: "Floor 2",
      locale: "default",
      ip: "10.10.0.54",
      online: 6,
      hardware: "RD03",
      model: null,
    },
  ],
  leafs: [
    {
      mac: "DE:AD:BE:EF:00:01",
      ip: "10.10.0.100",
      name: "iPhone",
      online: 1,
      parent_id: "AA:BB:CC:00:00:02",
    },
    {
      mac: "DE:AD:BE:EF:00:02",
      ip: "10.10.0.101",
      name: "Laptop",
      online: 1,
      parent_id: "AA:BB:CC:00:00:01",
    },
  ],
};

async function mockXiaomiTopology(page: Page, data: unknown) {
  await page.route("**/api/v1/xiaomi/topology", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}

/**
 * The /topology Mesh tab renders the XiaomiMeshTopology component when
 * settings have xiaomi_mesh_enabled true. We patch settings to make sure
 * the Mesh tab is reachable regardless of the local DB state.
 */
async function mockXiaomiEnabled(page: Page) {
  await page.route("**/api/v1/settings", async (route) => {
    try {
      const response = await route.fetch();
      const json = await response.json();
      json.xiaomi_mesh_enabled = true;
      await route.fulfill({ response, json });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xiaomi_mesh_enabled: true }),
      });
    }
  });
}

test.describe("Mesh topology — name resolution & SVG map (#807)", () => {
  test.beforeEach(async ({ page }) => {
    await mockXiaomiEnabled(page);
    await mockXiaomiTopology(page, XIAOMI_TOPOLOGY_WITH_DEFAULT_LOCALE);
    await login(page);
  });

  test("topology Mesh tab renders real names, not the locale placeholder", async ({
    page,
  }) => {
    await page.goto("/topology/");

    await expect(page.getByTestId("topology-root")).toBeVisible({
      timeout: 15000,
    });

    // Switch to the Mesh tab — verify the component mounts.
    await page.getByTestId("topology-tab-mesh").click();
    const meshPane = page.getByTestId("topology-mesh-pane");
    await expect(meshPane).toBeVisible({ timeout: 10000 });
    await expect(
      meshPane.getByTestId("xiaomi-mesh-topology"),
    ).toBeVisible({ timeout: 15000 });

    // Each user-set node label must render — none should collapse to
    // "default". Use the SVG topology surface (which is dedicated to #807)
    // so the assertion is unambiguous.
    const svg = meshPane.getByTestId("mesh-topology-svg");
    await expect(svg).toBeVisible();
    await expect(svg.getByText("OK Home")).toBeVisible();
    await expect(svg.getByText("Live Studio")).toBeVisible();
    await expect(svg.getByText("Basement")).toBeVisible();
    await expect(svg.getByText("Floor 2")).toBeVisible();

    // The literal placeholder string must not appear as a node label.
    await expect(svg.getByText("default", { exact: true })).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/mesh-topology-names-807.png",
      fullPage: true,
    });
  });

  test("topology Mesh tab includes an SVG topology map, not only cards", async ({
    page,
  }) => {
    await page.goto("/topology/");
    await page.getByTestId("topology-tab-mesh").click();

    const meshPane = page.getByTestId("topology-mesh-pane");
    await expect(meshPane.getByTestId("mesh-topology-svg")).toBeVisible({
      timeout: 15000,
    });

    // SVG element must be present inside the map container — this is the
    // concrete "visual SVG/topology map" acceptance criterion.
    const svgEl = meshPane
      .getByTestId("mesh-topology-svg")
      .locator("svg")
      .first();
    await expect(svgEl).toBeVisible();

    // The main router is the first node — assert its SVG group exists with
    // the user-set label.
    await expect(
      meshPane.getByTestId("mesh-svg-node-AA:BB:CC:00:00:01"),
    ).toBeAttached();
    await expect(
      meshPane.getByTestId("mesh-svg-node-AA:BB:CC:00:00:02"),
    ).toBeAttached();
  });

  test("router/xiaomi legacy Mesh Topology tab also renders real names", async ({
    page,
  }) => {
    // The same XiaomiMeshTopology component is embedded in
    // /router/xiaomi when the `?legacy=1` flag is set. Same fix must apply
    // there — regression coverage for the second mount point.
    await page.goto("/router/xiaomi/?legacy=1");
    await page.getByTestId("router-tab-mesh").click();

    const svg = page.getByTestId("mesh-topology-svg");
    await expect(svg).toBeVisible({ timeout: 15000 });
    await expect(svg.getByText("Live Studio")).toBeVisible();
    await expect(svg.getByText("Basement")).toBeVisible();
    await expect(svg.getByText("default", { exact: true })).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/router-xiaomi-mesh-names-807.png",
      fullPage: true,
    });
  });
});
