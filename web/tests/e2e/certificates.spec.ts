import { expect, login, test, createCaddyHost } from "../../e2e/fixtures";

test.describe("SSL Certificates page", () => {
  test.describe.configure({ mode: "serial" });

  const domain = `certificate-probe-${Date.now()}.example.com`;

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

  test("shows the live certificate inventory surface", async ({ page }) => {
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
      await expect(page.getByRole("columnheader", { name: heading })).toBeVisible();
    }

    const pageContent = (await page.textContent("body")) ?? "";
    expect(pageContent).not.toContain("Nginx Proxy Manager");
    expect(pageContent).not.toContain("NPM");
    expect(pageContent).not.toContain("Let's Encrypt");
    await page.screenshot({
      path: "tests/screenshots/certificates-page.png",
      fullPage: true,
    });
  });

  test("probes a TLS-enabled host and displays a stable error", async ({
    page,
  }) => {
    await page.goto("/caddy/");
    await expect(
      page.getByRole("heading", { name: "Caddy Reverse Proxy", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await createCaddyHost(page, domain, "10.0.0.5", "8080", true);

    await page.goto("/certificates/");
    const probeButton = page.getByRole("button", { name: /Probe now|Probing…/ });
    await expect(probeButton).toHaveText(/^(Probe now|Probing…)$/);
    if ((await probeButton.textContent()) === "Probe now") {
      await probeButton.click();
    }
    await expect(probeButton).toHaveText("Probe now", { timeout: 30000 });

    const row = page.getByRole("row").filter({ hasText: domain });
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

  test("removes stale certificate rows after the host is deleted", async ({
    page,
  }) => {
    await page.goto("/caddy/");
    const hostRow = page.getByRole("row").filter({ hasText: domain });
    await expect(hostRow).toBeVisible({ timeout: 15000 });
    await hostRow.getByRole("button").nth(1).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(hostRow).not.toBeVisible({ timeout: 20000 });

    await page.goto("/certificates/");
    const probeButton = page.getByRole("button", { name: "Probe now" });
    await probeButton.click();
    await expect(page.getByRole("button", { name: "Probe now" })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole("row").filter({ hasText: domain })).toHaveCount(0);
  });
});
