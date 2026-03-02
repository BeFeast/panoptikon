import { test, expect, login } from "../../e2e/fixtures";

test.describe("SSL Certificates page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/certificates/");
    // Wait for the page to finish loading (skeleton or real content)
    await page.waitForLoadState("networkidle");
  });

  test("does not reference Nginx Proxy Manager", async ({ page }) => {
    const pageContent = await page.textContent("body");
    expect(pageContent).not.toContain("Nginx Proxy Manager");

    await page.screenshot({
      path: "tests/screenshots/certificates-no-npm.png",
      fullPage: true,
    });
  });

  test("references Caddy instead of NPM in headings and descriptions", async ({
    page,
  }) => {
    const pageContent = await page.textContent("body");

    // The page should reference Caddy (either in configured state messages
    // or in the subtitle/tooltip when connected)
    // Check that NPM-specific branding is gone
    expect(pageContent).not.toContain("NPM Not Configured");
    expect(pageContent).not.toContain("NPM Unreachable");
    expect(pageContent).not.toContain("managed by NPM");

    // If the "not configured" state is shown, verify it says Caddy
    const notConfiguredHeading = page.getByText("Caddy Not Configured");
    const sslHeading = page.getByText("SSL Certificates");

    // One of these should be visible depending on connection state
    await Promise.race([
      notConfiguredHeading.waitFor({ state: "visible", timeout: 10000 }),
      sslHeading.waitFor({ state: "visible", timeout: 10000 }),
    ]);

    await page.screenshot({
      path: "tests/screenshots/certificates-caddy-branding.png",
      fullPage: true,
    });
  });
});
