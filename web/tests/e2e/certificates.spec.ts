import {
  createCaddyHost,
  expect,
  login,
  test,
} from "../../e2e/fixtures";

const probeDomain = `certificate-probe-${Date.now()}.example.com`;

test.describe("SSL Certificates page", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await login(page);
    const response = await page.request.patch("/api/v1/settings", {
      data: {
        caddy_cert_probe_host: "127.0.0.1",
        caddy_cert_probe_port: 1,
      },
    });
    expect(response.ok()).toBeTruthy();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await login(page);
    await page.request.patch("/api/v1/settings", {
      data: {
        caddy_cert_probe_host: "",
        caddy_cert_probe_port: 443,
      },
    });
    await page.close();
  });

  test("shows the live TLS probe workspace", async ({ page }) => {
    await page.goto("/certificates/");
    await expect(
      page.getByRole("heading", { name: "SSL Certificates", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Probe now" })).toBeVisible();
    for (const heading of [
      "Domain",
      "Issuer",
      "Expires",
      "Chain",
      "Status",
      "Probed",
    ]) {
      await expect(
        page.getByRole("columnheader", { name: heading }),
      ).toBeVisible();
    }

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Nginx Proxy Manager");
    expect(body).not.toContain("NPM");
    expect(body).not.toContain("Let's Encrypt");
    await page.screenshot({
      path: "tests/screenshots/certificates-page.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "SSL Certificates", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Probe now" })).toBeVisible();
    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBeFalsy();
    await page.screenshot({
      path: "tests/screenshots/certificates-page-mobile.png",
      fullPage: true,
    });
  });

  test("probes a TLS-enabled host and displays its connection error", async ({
    page,
  }) => {
    await page.goto("/caddy/");
    await expect(
      page.getByRole("heading", { name: "Caddy Reverse Proxy", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await createCaddyHost(page, probeDomain, "10.0.0.5", "8080", true);

    await page.goto("/certificates/");
    const probe = page.getByRole("button", { name: "Probe now" });
    await expect(probe).toBeVisible({ timeout: 15000 });
    await probe.click();
    await expect(probe).toHaveText(/^(Probe now|Probing…)$/);
    await expect(probe).toHaveText("Probe now", { timeout: 30000 });

    const row = page.getByRole("row").filter({ hasText: probeDomain });
    await expect(row).toBeVisible();
    const errorBadge = row.getByText("Error", { exact: true });
    await expect(errorBadge).toBeVisible();
    await errorBadge.hover();
    await expect(page.getByRole("tooltip")).toContainText("connect failed:");
    await page.screenshot({
      path: "tests/screenshots/certificates-probe-result.png",
      fullPage: true,
    });
  });

  test("removes stale certificate rows after a host is deleted", async ({
    page,
  }) => {
    await page.goto("/caddy/");
    const hostRow = page.getByRole("row").filter({ hasText: probeDomain });
    await expect(hostRow).toBeVisible({ timeout: 15000 });
    await hostRow.locator("button").last().click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Delete" }).click();
    await expect(hostRow).not.toBeVisible({ timeout: 20000 });

    await page.goto("/certificates/");
    const probe = page.getByRole("button", { name: "Probe now" });
    await expect(probe).toBeVisible({ timeout: 15000 });
    await probe.click();
    await expect(probe).toHaveText("Probe now", { timeout: 30000 });
    await expect(page.getByRole("row").filter({ hasText: probeDomain })).toHaveCount(0);
  });
});
