import { test, expect, login } from "../../e2e/fixtures";

test.describe("Scanner Enrichment Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/scanner/");
    await expect(page.getByText("Scanner Configuration")).toBeVisible({
      timeout: 15000,
    });
    await page.waitForLoadState("networkidle");
  });

  test("page renders enrichment source toggles", async ({ page }) => {
    await expect(page.getByText("Enrichment Sources")).toBeVisible();
    await expect(page.getByText("Nmap service detection")).toBeVisible();
    await expect(page.getByText("NetBIOS name lookup")).toBeVisible();
    await expect(page.getByText("SNMP discovery")).toBeVisible();
    await expect(page.getByText("HTTP fingerprinting")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/scanner-enrichment-toggles.png",
    });
  });

  test("save and reload persists enrichment toggles", async ({ page }) => {
    // All toggles should start as OFF (default)
    const nmapToggle = page.getByTestId("nmap-toggle");
    const netbiosToggle = page.getByTestId("netbios-toggle");
    const snmpToggle = page.getByTestId("snmp-toggle");
    const httpToggle = page.getByTestId("http-fingerprint-toggle");

    // Enable nmap and netbios
    await nmapToggle.click();
    await netbiosToggle.click();

    // Verify they are now checked
    await expect(nmapToggle).toHaveAttribute("aria-checked", "true");
    await expect(netbiosToggle).toHaveAttribute("aria-checked", "true");
    await expect(snmpToggle).toHaveAttribute("aria-checked", "false");
    await expect(httpToggle).toHaveAttribute("aria-checked", "false");

    // Save
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Scanner settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({
      path: "tests/screenshots/scanner-enrichment-saved.png",
    });

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByText("Scanner Configuration")).toBeVisible({
      timeout: 15000,
    });
    await page.waitForLoadState("networkidle");

    // Wait for settings to load (toggles update after fetch)
    await expect(page.getByTestId("nmap-toggle")).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: 10000 },
    );
    await expect(page.getByTestId("netbios-toggle")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("snmp-toggle")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(page.getByTestId("http-fingerprint-toggle")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await page.screenshot({
      path: "tests/screenshots/scanner-enrichment-persisted.png",
    });

    // Clean up: disable toggles back
    await page.getByTestId("nmap-toggle").click();
    await page.getByTestId("netbios-toggle").click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Scanner settings saved.")).toBeVisible({
      timeout: 10000,
    });
  });

  test("scan now button on devices page shows summary toast", async ({
    page,
  }) => {
    await page.goto("/devices/");
    await expect(page.getByText("Scan Now")).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/devices-scan-button.png",
    });

    // Click the scan button
    await page.getByText("Scan Now").click();

    // Should show scanning state
    await expect(page.getByText("Scanning…")).toBeVisible({ timeout: 5000 });

    // Wait for scan to complete — the toast should appear with summary
    await expect(page.getByText("Network scan complete")).toBeVisible({
      timeout: 60000,
    });

    // The toast should contain a summary with "scanned"
    await expect(page.getByText(/\d+ scanned/)).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: "tests/screenshots/devices-scan-complete.png",
    });
  });
});
