import type { Page } from "@playwright/test";
import { test, expect, login } from "../../e2e/fixtures";

const status = {
  configured: true,
  connected: true,
  tunnel_id: "tunnel-1",
  tunnel_name: "panoptikon",
  created_at: "2026-05-22T00:00:00Z",
  connections: [
    {
      colo_name: "IAD",
      is_pending_reconnect: false,
      origin_ip: "10.10.0.13",
      opened_at: "2026-05-22T00:00:00Z",
    },
  ],
};

async function mockCloudflareTunnelApis(page: Page, requests: unknown[]) {
  let routes = [
    {
      hostname: "scribe.oklabs.uk",
      service: "http://10.10.0.13:13120",
      path: null,
    },
    {
      hostname: "api.oklabs.uk",
      service: "http://10.10.0.13:13120",
      path: "/api",
    },
  ];

  await page.route("**/api/v1/cloudflare-tunnel/status", (route) =>
    route.fulfill({ status: 200, json: status }),
  );

  await page.route("**/api/v1/cloudflare-tunnel/routes/*", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {
      hostname: string;
      service: string;
      path?: string;
    };
    requests.push(body);
    routes = routes.map((item) =>
      item.hostname === "scribe.oklabs.uk"
        ? { ...item, ...body, path: body.path ?? null }
        : item,
    );

    await route.fulfill({
      status: 200,
      json: { success: true, message: "Route updated" },
    });
  });

  await page.route("**/api/v1/cloudflare-tunnel/routes", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: { routes } });
      return;
    }

    const body = request.postDataJSON() as {
      hostname: string;
      service: string;
      path?: string;
    };
    requests.push(body);
    routes = [...routes, { ...body, path: body.path ?? null }];

    await route.fulfill({
      status: 201,
      json: { success: true, message: "Route added" },
    });
  });
}

test.describe("Cloudflare Tunnel path normalization", () => {
  test("catch-all host routes round-trip as an empty path and omit root path on save", async ({
    page,
  }) => {
    const requests: unknown[] = [];
    await mockCloudflareTunnelApis(page, requests);
    await login(page);

    await page.goto("/cloudflare-tunnel/");
    await expect(
      page.getByRole("heading", { name: "Cloudflare Tunnel", exact: true }),
    ).toBeVisible({ timeout: 15000 });

    const catchAllRow = page
      .locator("tbody tr")
      .filter({ hasText: "scribe.oklabs.uk" });
    await expect(catchAllRow.locator("td").nth(2)).toHaveText("");

    await catchAllRow
      .locator("button")
      .filter({ has: page.locator("svg.lucide-pencil") })
      .click();
    await expect(page.locator("#edit-path")).toHaveValue("");
    await expect(
      page.getByText("Optional. Leave empty to match the whole hostname."),
    ).toBeVisible();

    await page.locator("#edit-path").fill("/");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toEqual({
      hostname: "scribe.oklabs.uk",
      service: "http://10.10.0.13:13120",
    });
  });

  test("whitespace and root paths are omitted while specific paths are preserved", async ({
    page,
  }) => {
    const requests: unknown[] = [];
    await mockCloudflareTunnelApis(page, requests);
    await login(page);

    await page.goto("/cloudflare-tunnel/");
    await page.getByRole("button", { name: "Add Route" }).click();
    await page.locator("#hostname").fill("root.oklabs.uk");
    await page.locator("#service").fill("http://10.10.0.13:13120");
    await page.locator("#path").fill(" / ");
    await page.getByRole("button", { name: "Add Route" }).click();

    await page.getByRole("button", { name: "Add Route" }).click();
    await page.locator("#hostname").fill("api-v2.oklabs.uk");
    await page.locator("#service").fill("http://10.10.0.13:13120");
    await page.locator("#path").fill(" ^/api ");
    await page.getByRole("button", { name: "Add Route" }).click();

    await expect.poll(() => requests.length).toBe(2);
    expect(requests[0]).toEqual({
      hostname: "root.oklabs.uk",
      service: "http://10.10.0.13:13120",
    });
    expect(requests[1]).toEqual({
      hostname: "api-v2.oklabs.uk",
      service: "http://10.10.0.13:13120",
      path: "^/api",
    });
  });
});
