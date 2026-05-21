import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * Regression coverage for issue #807 — "Mesh topology should render correct
 * Wi-Fi SVG/topology roles".
 *
 * Before #807 the `/topology` Mesh tab rendered every Xiaomi mesh node as the
 * literal string `"default"` (only nodes the user had renamed in the Mi Home
 * app via the `locale` field — like "Live Studio" — survived), and the tab
 * showed cards-only with no SVG topology map.
 *
 * The fix has two parts:
 *  1. Backend `effective_mesh_name` strips the `"default"` sentinel and
 *     prefers `locale` over `name` so the real user-set room labels reach
 *     the UI.
 *  2. The `XiaomiMeshTopology` component now renders an SVG topology map
 *     (main router center, satellites on a ring) on top of the existing
 *     detail cards and applies the same sentinel filter in the label
 *     fallback chain.
 *
 * The tests mock `/api/v1/xiaomi/topology` with a payload that mirrors the
 * production response shape from the user's RD15 mesh — including a
 * satellite whose `name` is `"default"` and whose real label lives in
 * `locale: "Live Studio"`.
 */

// ── Mock payload (verbatim shape from production /api/v1/xiaomi/topology) ──

const MOCK_TOPOLOGY = {
  nodes: [
    {
      mac: "AA:BB:CC:DD:EE:01",
      // After the backend fix `name` is the *effective* name with the
      // "default" sentinel stripped. The fixture mirrors what the frontend
      // actually receives now: the room label promoted from `locale`.
      name: "OK Home",
      locale: "OK Home",
      ip: "10.10.0.199",
      online: 8,
      hardware: "RD15",
      model: null,
    },
    {
      mac: "AA:BB:CC:DD:EE:02",
      name: "Live Studio",
      locale: "Live Studio",
      ip: "10.10.0.52",
      online: 5,
      hardware: null,
      model: null,
    },
    {
      mac: "AA:BB:CC:DD:EE:03",
      name: "Basement",
      locale: "Basement",
      ip: "10.10.0.54",
      online: 4,
      hardware: null,
      model: null,
    },
    {
      mac: "AA:BB:CC:DD:EE:04",
      name: "Floor 2",
      locale: "Floor 2",
      ip: "10.10.0.53",
      online: 8,
      hardware: null,
      model: null,
    },
  ],
  leafs: [],
};

/**
 * Same payload but with the **pre-fix backend** shape — `name="default"`
 * sentinel and only `Live Studio` carrying a usable `locale`. This locks in
 * the frontend safety net: even with a stale backend, the UI must not
 * render the "default" sentinel.
 */
const MOCK_TOPOLOGY_RAW_SENTINEL = {
  nodes: [
    {
      mac: "AA:BB:CC:DD:EE:01",
      name: "OK Home",
      locale: null,
      ip: "10.10.0.199",
      online: 8,
      hardware: "RD15",
      model: null,
    },
    {
      mac: "AA:BB:CC:DD:EE:02",
      name: "default",
      locale: "Live Studio",
      ip: "10.10.0.52",
      online: 5,
      hardware: null,
      model: null,
    },
    {
      mac: "AA:BB:CC:DD:EE:03",
      name: "default",
      locale: "Basement",
      ip: "10.10.0.54",
      online: 4,
      hardware: null,
      model: null,
    },
    {
      mac: "AA:BB:CC:DD:EE:04",
      name: "default",
      locale: null,
      ip: "10.10.0.53",
      online: 8,
      hardware: null,
      model: null,
    },
  ],
  leafs: [],
};

async function mockXiaomiTopology(page: Page, payload: unknown) {
  await page.route("**/api/v1/xiaomi/topology", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    }),
  );
}

async function mockTopologyGraph(page: Page) {
  await page.route("**/api/v1/topology/graph", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        router: {
          router_type: "mikrotik",
          is_online: false,
          wan_ip: null,
          hostname: null,
          version: null,
        },
        devices: [],
        positions: [],
      }),
    }),
  );
  await page.route("**/api/v1/topology/positions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
}

test.describe("Topology → Mesh tab (#807)", () => {
  test.beforeEach(async ({ page }) => {
    await mockTopologyGraph(page);
    await login(page);
  });

  test("renders real Wi-Fi mesh names, an SVG topology, and never the 'default' sentinel", async ({
    page,
  }) => {
    await mockXiaomiTopology(page, MOCK_TOPOLOGY);
    await page.goto("/topology");

    await expect(page.getByTestId("topology-root")).toBeVisible({
      timeout: 15000,
    });

    // Switch to the Mesh tab.
    await page.getByTestId("topology-tab-mesh").click();

    const meshPane = page.getByTestId("topology-mesh-pane");
    await expect(meshPane).toBeVisible();
    await expect(
      meshPane.getByTestId("xiaomi-mesh-topology"),
    ).toBeVisible({ timeout: 15000 });

    // SVG topology map is present — fixes "only generic repeated cards".
    const svg = meshPane.getByTestId("xiaomi-mesh-svg");
    await expect(svg).toBeVisible();

    // Each node from the mocked topology renders as a positioned <g> in the
    // SVG with the user-facing label as `data-node-name`. This is the
    // load-bearing assertion: pre-fix every satellite would have rendered
    // with name="default".
    const svgNodes = meshPane.getByTestId("xiaomi-mesh-svg-node");
    await expect(svgNodes).toHaveCount(4);
    await expect(
      meshPane.locator('[data-testid="xiaomi-mesh-svg-node"][data-node-role="main"]'),
    ).toHaveCount(1);

    const labels = await svgNodes.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-node-name")),
    );
    expect(labels).toEqual(
      expect.arrayContaining(["OK Home", "Live Studio", "Basement", "Floor 2"]),
    );
    for (const label of labels) {
      expect(label?.toLowerCase()).not.toBe("default");
    }

    // Detail cards still render alongside the SVG (one per node).
    const cards = meshPane.getByTestId("xiaomi-mesh-node-card");
    await expect(cards).toHaveCount(4);
    const cardLabels = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-node-name")),
    );
    for (const label of cardLabels) {
      expect(label?.toLowerCase()).not.toBe("default");
    }

    // "default" must not appear anywhere in the visible mesh pane text — this
    // is the user-visible bug from the issue report.
    const paneText = (await meshPane.innerText()).toLowerCase();
    expect(paneText).not.toContain("default");

    await page.screenshot({
      path: "tests/screenshots/topology-mesh-svg.png",
      fullPage: true,
    });
  });

  test("frontend label fallback also strips 'default' when backend hasn't normalized", async ({
    page,
  }) => {
    // Stale backend safety net: feed the raw MiWiFi shape with name="default"
    // sentinels and verify the UI still shows the real `locale`-based names
    // and falls back to the IP for nodes with neither.
    await mockXiaomiTopology(page, MOCK_TOPOLOGY_RAW_SENTINEL);
    await page.goto("/topology");

    await expect(page.getByTestId("topology-root")).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId("topology-tab-mesh").click();

    const meshPane = page.getByTestId("topology-mesh-pane");
    await expect(
      meshPane.getByTestId("xiaomi-mesh-topology"),
    ).toBeVisible({ timeout: 15000 });

    const svgNodes = meshPane.getByTestId("xiaomi-mesh-svg-node");
    await expect(svgNodes).toHaveCount(4);
    const labels = await svgNodes.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-node-name") ?? ""),
    );
    // Renamed nodes via `locale`.
    expect(labels).toEqual(
      expect.arrayContaining(["OK Home", "Live Studio", "Basement"]),
    );
    // The node with name="default" and locale=null must fall back to IP,
    // never to the literal "default".
    expect(labels).toContain("10.10.0.53");
    for (const label of labels) {
      expect(label.toLowerCase()).not.toBe("default");
    }

    const paneText = (await meshPane.innerText()).toLowerCase();
    expect(paneText).not.toContain("default");
  });
});
