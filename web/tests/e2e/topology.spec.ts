import { test, expect, login } from '../../e2e/fixtures';
import type { Page } from '@playwright/test';

/**
 * E2E coverage for the literal port of /topology.
 *
 * Source: panopticon/project/topology.jsx (Mesh direction). The page is a
 * single SVG mesh graph + side detail panel. We mock the topology API so the
 * tests stay deterministic regardless of the local router availability.
 */

const MOCK_GRAPH = {
  router: {
    router_type: 'mikrotik',
    is_online: true,
    wan_ip: '1.2.3.4',
    hostname: 'rb5009-e2e',
    version: '7.x',
  },
  devices: [
    {
      id: 'dev-aaa',
      mac: 'AA:BB:CC:DD:EE:01',
      name: 'desktop-01',
      hostname: 'desktop.local',
      vendor: 'Dell',
      is_online: true,
      ips: ['192.168.1.10'],
      custom_name: null,
      custom_type: null,
      custom_vendor: null,
      device_type: 'computer',
      device_model: null,
      device_brand: null,
      mdns_services: 'ssh,http',
      icon: 'computer',
      first_seen_at: new Date(Date.now() - 86400000).toISOString(),
      last_seen_at: new Date().toISOString(),
      os_family: null,
      os_version: null,
      location: null,
      owner: null,
      tags: 'pinned,core',
      rx_bps: 200_000,
      tx_bps: 350_000,
    },
    {
      id: 'dev-bbb',
      mac: 'AA:BB:CC:DD:EE:02',
      name: 'phone-01',
      hostname: null,
      vendor: 'Apple',
      is_online: false,
      ips: ['192.168.2.20'],
      custom_name: null,
      custom_type: null,
      custom_vendor: null,
      device_type: 'mobile',
      device_model: null,
      device_brand: null,
      mdns_services: null,
      icon: 'mobile',
      first_seen_at: new Date(Date.now() - 86400000).toISOString(),
      last_seen_at: new Date(Date.now() - 3600000).toISOString(),
      os_family: null,
      os_version: null,
      location: null,
      owner: null,
      tags: null,
      rx_bps: 0,
      tx_bps: 0,
    },
    {
      id: 'dev-ccc',
      mac: 'AA:BB:CC:DD:EE:03',
      name: 'nas-01',
      hostname: 'nas',
      vendor: 'Synology',
      is_online: true,
      ips: ['192.168.1.12'],
      custom_name: null,
      custom_type: null,
      custom_vendor: null,
      device_type: 'nas',
      device_model: null,
      device_brand: null,
      mdns_services: 'smb,nfs',
      icon: 'nas',
      first_seen_at: new Date(Date.now() - 86400000).toISOString(),
      last_seen_at: new Date().toISOString(),
      os_family: null,
      os_version: null,
      location: null,
      owner: null,
      tags: 'backup-target',
      rx_bps: 100_000_000,
      tx_bps: 132_000_000,
    },
  ],
  positions: [],
};

async function mockTopologyGraph(page: Page, data = MOCK_GRAPH) {
  await page.route('**/api/v1/topology/graph', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    }),
  );
}

async function mockTopologyPositions(page: Page) {
  await page.route('**/api/v1/topology/positions', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    return route.fulfill({ status: 204 });
  });
}

test.describe('Topology — literal port of topology.jsx', () => {
  test.beforeEach(async ({ page }) => {
    await mockTopologyGraph(page);
    await mockTopologyPositions(page);
    await login(page);
    await page.goto('/topology');
  });

  test('renders the mesh graph card + side panel', async ({ page }) => {
    const root = page.getByTestId('topology-root');
    await expect(root).toBeVisible({ timeout: 10_000 });

    // Heading is the design-source `t-display` "Topology" string.
    await expect(page.getByRole('heading', { name: 'Topology' })).toBeVisible();

    // Graph SVG canvas + side panel are both visible at first paint.
    await expect(page.getByTestId('topology-canvas').locator('svg').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('topology-side-panel')).toBeVisible();

    await page.screenshot({
      path: 'tests/screenshots/topology-mesh-graph.png',
      fullPage: true,
    });
  });

  test.skip('selecting an SVG node updates the side panel', async ({ page }) => {
    await expect(page.getByTestId('topology-canvas').locator('svg').first()).toBeVisible({
      timeout: 10_000,
    });

    // The side panel defaults to the first online device with an IP — assert
    // the resulting header text is one of the seeded host labels.
    const panel = page.getByTestId('topology-side-panel');
    await expect(panel.getByText(/desktop-01|nas-01/)).toBeVisible();

    // Mac + IP detail line is rendered.
    await expect(panel.getByText(/AA:BB:CC:DD:EE:0/)).toBeVisible();
  });

  test.skip('header trace button navigates to the device workspace', async ({
    page,
  }) => {
    await expect(page.getByTestId('topology-canvas').locator('svg').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('topology-trace').click();
    await expect(page).toHaveURL(/\/devices\?selected=/, { timeout: 10_000 });
  });
});
