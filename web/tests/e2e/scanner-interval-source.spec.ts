import { test, expect, login } from "../../e2e/fixtures";

// The scan interval saved on /settings/scanner is the value the scanner loop
// uses (`effective_scan_interval_secs` on the server). The page must show that
// value after a reload, and the server must reject intervals the scanner would
// not honour.
test.describe("Settings — scan interval is the scanner's source of truth", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await page.request.patch("/api/v1/settings", {
      data: { scan_interval_seconds: 60 },
    });
  });

  test("saved interval survives reload and is explained as authoritative", async ({ page }) => {
    // Wait for the page's own settings load, otherwise it overwrites the
    // value typed below.
    const settingsLoaded = page.waitForResponse(
      (res) => res.url().endsWith("/api/v1/settings") && res.request().method() === "GET",
    );
    await page.goto("/settings/scanner");
    await settingsLoaded;
    await expect(
      page.getByRole("heading", { name: "Network Scanner", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId("scan-interval-help")).toContainText(
      "The scanner uses this value from its next cycle",
    );

    const interval = page.locator("#scan-interval");
    await interval.fill("120");
    await page.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => {
      const res = await page.request.get("/api/v1/settings");
      return (await res.json()).scan_interval_seconds;
    }).toBe(120);

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Network Scanner", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#scan-interval")).toHaveValue("120");

    await page.screenshot({
      path: "tests/screenshots/settings-scanner-interval-roundtrip.png",
    });
  });

  test("server rejects an interval below the scanner minimum", async ({ page }) => {
    const ok = await page.request.patch("/api/v1/settings", {
      data: { scan_interval_seconds: 90 },
    });
    expect(ok.ok()).toBeTruthy();

    const rejected = await page.request.patch("/api/v1/settings", {
      data: { scan_interval_seconds: 5 },
    });
    expect(rejected.status()).toBe(400);

    // The page still shows the interval the scanner is using.
    await page.goto("/settings/scanner");
    await expect(page.locator("#scan-interval")).toHaveValue("90", { timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/settings-scanner-interval-minimum.png",
    });
  });
});
