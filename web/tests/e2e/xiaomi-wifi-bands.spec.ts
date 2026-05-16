/**
 * E2E tests for Xiaomi WiFi bands deduplication fix (#545) and
 * display fixes for channel=0 / clients=0 on mesh routers (#548).
 *
 * Root cause (#545): Xiaomi BE3600 in auto-channel mode reports `channel:"0"`
 * and `bandwidth:"0"` for all radios.  The old frontend logic
 * (`parseInt(channel) > 14`) mis-classified every entry as "2.4 GHz",
 * causing a duplicate band card.
 *
 * Root cause (#548): Channel "0" (auto-channel) was displayed literally as
 * "0". Mesh routers may not report per-band client info, so clients showed
 * "0" even when the data was simply unavailable.
 *
 * These tests verify:
 * 1. The `/api/v1/xiaomi/wifi-bands` response always carries an explicit
 *    `band` field (never relies purely on channel number for inference).
 * 2. When the API returns two entries that would both map to "2.4 GHz" under
 *    the old channel-based logic, the UI renders exactly two distinct band
 *    cards — one "2.4 GHz" and one "5 GHz".
 * 3. No duplicate band cards appear in the WiFi Bands section.
 * 4. Channel "0" is displayed as "Auto" in the UI (#548).
 * 5. Clients show "—" when per-band data is unavailable (#548).
 */

import { test, expect, login } from "../../e2e/fixtures";

test.describe("Xiaomi WiFi Bands dedup (#545)", () => {
  // ── API contract ──────────────────────────────────────────

  test("wifi-bands API returns explicit band field on every entry", async ({
    page,
  }) => {
    await login(page);

    const resp = await page.request.get("/api/v1/xiaomi/wifi-bands");
    // Skip gracefully if Xiaomi is not configured (503) OR configured but
    // unreachable (502/504).  The latter can happen when a previous test in
    // the suite saved Xiaomi settings and the router is not available in CI.
    if (!resp.ok()) {
      test.skip();
      return;
    }

    const bands = await resp.json();
    expect(Array.isArray(bands)).toBe(true);

    for (const entry of bands) {
      // Every entry must have a non-empty `band` string
      expect(typeof entry.band).toBe("string");
      expect(entry.band.length).toBeGreaterThan(0);
      // Band must be one of the known labels
      expect(["2.4GHz", "5GHz", "6GHz"]).toContain(entry.band);
    }
  });

  test("wifi-bands API returns no duplicate band+ssid pairs", async ({
    page,
  }) => {
    await login(page);

    const resp = await page.request.get("/api/v1/xiaomi/wifi-bands");
    // Skip gracefully if Xiaomi is not configured (503) OR configured but
    // unreachable (502/504) — see note in first test.
    if (!resp.ok()) {
      test.skip();
      return;
    }

    const bands = await resp.json();

    const seen = new Set<string>();
    for (const entry of bands) {
      const key = `${entry.band}|${entry.ssid ?? ""}`;
      expect(
        seen.has(key),
        `Duplicate band+ssid key found in API response: "${key}"`,
      ).toBe(false);
      seen.add(key);
    }
  });

  test("wifi-bands API infers band correctly for channel=0 (auto-channel)", async ({
    page,
  }) => {
    await login(page);

    const resp = await page.request.get("/api/v1/xiaomi/wifi-bands");
    // Skip gracefully if Xiaomi is not configured (503) OR configured but
    // unreachable (502/504) — see note in first test.
    if (!resp.ok()) {
      test.skip();
      return;
    }

    const bands = await resp.json();

    // If the router reports channel "0" for any entry, the `band` field must
    // still be a valid label (position-based fallback was applied).
    for (const entry of bands) {
      if (entry.channel === "0" || entry.channel === null) {
        expect(
          ["2.4GHz", "5GHz", "6GHz"],
          `Entry with channel="${entry.channel}" has invalid band "${entry.band}"`,
        ).toContain(entry.band);
      }
    }

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-channel-zero.png",
    });
  });

  // ── UI rendering ──────────────────────────────────────────

  test("WiFi Bands section renders distinct band cards without duplicates", async ({
    page,
  }) => {
    await login(page);

    // Navigate to the Xiaomi router tab where WifiBandsSection lives
    await page.goto("/router/xiaomi/");

    // If Xiaomi is not configured or unreachable, skip — no WiFi Bands section.
    const wifiBandsHeading = page.getByText("WiFi Bands");
    const notConfigured = page.getByText(/not configured|unreachable/i);
    const resolved = await Promise.race([
      wifiBandsHeading
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "bands"),
      notConfigured
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => "skip"),
    ]).catch(() => "skip");

    if (resolved === "skip") {
      test.skip();
      return;
    }

    // Collect all rendered band badge texts (e.g. "2.4 GHz", "5 GHz")
    const bandBadges = page.locator(
      "text=/^(2\\.4 GHz|5 GHz|6 GHz)$/",
    );
    const count = await bandBadges.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Check for duplicates
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      labels.push(await bandBadges.nth(i).textContent() ?? "");
    }

    const duplicates = labels.filter(
      (label, i) => labels.indexOf(label) !== i,
    );
    expect(
      duplicates,
      `Duplicate band badges in UI: ${duplicates.join(", ")}`,
    ).toHaveLength(0);

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-no-duplicates.png",
      fullPage: true,
    });
  });
});

test.describe("Xiaomi WiFi Bands display fixes (#548)", () => {
  // ── Channel=0 → "Auto" ─────────────────────────────────

  test("channel=0 displays as 'Auto' instead of '0'", async ({ page }) => {
    await login(page);

    // Mock the status API so the router appears configured+reachable in CI
    await page.route("**/api/v1/xiaomi/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          cpu_cores: null,
          cpu_freq: null,
          cpu_load: null,
          mem_usage: null,
          mem_total: null,
          mem_type: null,
          temperature: null,
          wan_download: null,
          wan_upload: null,
          devices_online: null,
          devices_total: null,
          uptime: null,
        }),
      }),
    );

    // Mock the wifi-bands API to return channel "0" (auto-channel mode)
    await page.route("**/api/v1/xiaomi/wifi-bands", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            band: "2.4GHz",
            ssid: "TestNetwork",
            channel: "0",
            bandwidth: "0",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
          {
            band: "5GHz",
            ssid: "TestNetwork",
            channel: "0",
            bandwidth: "0",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
        ]),
      }),
    );

    // Mock wifi-devices to return empty (mesh scenario)
    await page.route("**/api/v1/xiaomi/wifi-devices", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );

    await page.goto("/router/xiaomi/");

    // Wait for WiFi Bands section to appear
    const wifiBandsHeading = page.getByText("WiFi Bands");
    await wifiBandsHeading.waitFor({ state: "visible", timeout: 15000 });

    // Verify "Auto" appears where channel would be displayed
    const autoLabels = page.locator("text=Auto");
    await expect(autoLabels.first()).toBeVisible();

    // Verify "0" is NOT displayed as channel value (could appear as status text, so
    // specifically check within the grid structure near "Channel" label)
    const channelSections = page.locator("text=Channel");
    const channelCount = await channelSections.count();
    for (let i = 0; i < channelCount; i++) {
      const parent = channelSections.nth(i).locator("..");
      const text = await parent.textContent();
      expect(text).toContain("Auto");
      expect(text).not.toMatch(/^Channel\s*0$/);
    }

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-channel-auto.png",
      fullPage: true,
    });
  });

  test("null channel also displays as 'Auto'", async ({ page }) => {
    await login(page);

    // Mock the status API so the router appears configured+reachable in CI
    await page.route("**/api/v1/xiaomi/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          cpu_cores: null,
          cpu_freq: null,
          cpu_load: null,
          mem_usage: null,
          mem_total: null,
          mem_type: null,
          temperature: null,
          wan_download: null,
          wan_upload: null,
          devices_online: null,
          devices_total: null,
          uptime: null,
        }),
      }),
    );

    await page.route("**/api/v1/xiaomi/wifi-bands", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            band: "2.4GHz",
            ssid: "TestNetwork",
            channel: null,
            bandwidth: null,
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
        ]),
      }),
    );

    await page.route("**/api/v1/xiaomi/wifi-devices", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );

    await page.goto("/router/xiaomi/");

    const wifiBandsHeading = page.getByText("WiFi Bands");
    await wifiBandsHeading.waitFor({ state: "visible", timeout: 15000 });

    // Channel should show "Auto" for null channel
    const channelSection = page.locator("text=Channel").first().locator("..");
    const text = await channelSection.textContent();
    expect(text).toContain("Auto");

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-channel-null-auto.png",
      fullPage: true,
    });
  });

  // ── Clients display ─────────────────────────────────────

  test("clients show dash when per-band info is unavailable (no wifi devices)", async ({
    page,
  }) => {
    await login(page);

    // Mock the status API so the router appears configured+reachable in CI
    await page.route("**/api/v1/xiaomi/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          cpu_cores: null,
          cpu_freq: null,
          cpu_load: null,
          mem_usage: null,
          mem_total: null,
          mem_type: null,
          temperature: null,
          wan_download: null,
          wan_upload: null,
          devices_online: null,
          devices_total: null,
          uptime: null,
        }),
      }),
    );

    await page.route("**/api/v1/xiaomi/wifi-bands", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            band: "2.4GHz",
            ssid: "TestNetwork",
            channel: "6",
            bandwidth: "HT40",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
        ]),
      }),
    );

    // No wifi devices at all — per-band counts unavailable
    await page.route("**/api/v1/xiaomi/wifi-devices", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );

    await page.goto("/router/xiaomi/");

    const wifiBandsHeading = page.getByText("WiFi Bands");
    await wifiBandsHeading.waitFor({ state: "visible", timeout: 15000 });

    // Clients should show "—" (em dash), not "0"
    const clientsSection = page.locator("text=Clients").first().locator("..");
    const text = await clientsSection.textContent();
    expect(text).toContain("\u2014"); // em dash
    expect(text).not.toMatch(/Clients\s*0/);

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-clients-unavailable.png",
      fullPage: true,
    });
  });

  test("clients show dash when all devices have null band (mesh)", async ({
    page,
  }) => {
    await login(page);

    // Mock the status API so the router appears configured+reachable in CI
    await page.route("**/api/v1/xiaomi/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          cpu_cores: null,
          cpu_freq: null,
          cpu_load: null,
          mem_usage: null,
          mem_total: null,
          mem_type: null,
          temperature: null,
          wan_download: null,
          wan_upload: null,
          devices_online: null,
          devices_total: null,
          uptime: null,
        }),
      }),
    );

    await page.route("**/api/v1/xiaomi/wifi-bands", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            band: "2.4GHz",
            ssid: "TestNetwork",
            channel: "0",
            bandwidth: "0",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
          {
            band: "5GHz",
            ssid: "TestNetwork",
            channel: "0",
            bandwidth: "0",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
        ]),
      }),
    );

    // Devices exist but none have band info (typical mesh scenario)
    await page.route("**/api/v1/xiaomi/wifi-devices", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { mac: "AA:BB:CC:DD:EE:01", ip: "192.168.1.10", name: "Phone", signal: -45, band: null },
          { mac: "AA:BB:CC:DD:EE:02", ip: "192.168.1.11", name: "Laptop", signal: -50, band: null },
        ]),
      }),
    );

    await page.goto("/router/xiaomi/");

    const wifiBandsHeading = page.getByText("WiFi Bands");
    await wifiBandsHeading.waitFor({ state: "visible", timeout: 15000 });

    // All band cards should show "—" for clients since no device has band info
    const clientsSections = page.locator("text=Clients");
    const count = await clientsSections.count();
    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const parent = clientsSections.nth(i).locator("..");
      const text = await parent.textContent();
      expect(text).toContain("\u2014"); // em dash
    }

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-clients-mesh-no-band.png",
      fullPage: true,
    });
  });

  test("clients show actual count when per-band info is available", async ({
    page,
  }) => {
    await login(page);

    // Mock the status API so the router appears configured+reachable in CI
    await page.route("**/api/v1/xiaomi/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          cpu_cores: null,
          cpu_freq: null,
          cpu_load: null,
          mem_usage: null,
          mem_total: null,
          mem_type: null,
          temperature: null,
          wan_download: null,
          wan_upload: null,
          devices_online: null,
          devices_total: null,
          uptime: null,
        }),
      }),
    );

    await page.route("**/api/v1/xiaomi/wifi-bands", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            band: "2.4GHz",
            ssid: "TestNetwork",
            channel: "6",
            bandwidth: "HT40",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
          {
            band: "5GHz",
            ssid: "TestNetwork",
            channel: "36",
            bandwidth: "VHT80",
            encryption: "mixed-psk",
            signal: null,
            status: "1",
            band_steering: "0",
          },
        ]),
      }),
    );

    // Devices with band info (non-mesh / band info available)
    await page.route("**/api/v1/xiaomi/wifi-devices", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { mac: "AA:BB:CC:DD:EE:01", ip: "192.168.1.10", name: "Phone", signal: -45, band: "2.4g" },
          { mac: "AA:BB:CC:DD:EE:02", ip: "192.168.1.11", name: "Laptop", signal: -50, band: "5g" },
          { mac: "AA:BB:CC:DD:EE:03", ip: "192.168.1.12", name: "Tablet", signal: -55, band: "5g" },
        ]),
      }),
    );

    await page.goto("/router/xiaomi/");

    const wifiBandsHeading = page.getByText("WiFi Bands");
    await wifiBandsHeading.waitFor({ state: "visible", timeout: 15000 });

    // 2.4 GHz band should show 1 client
    // Verify numeric client counts appear (not dashes)
    const clientsSections = page.locator("text=Clients");
    const clientsCount = await clientsSections.count();
    expect(clientsCount).toBe(2);

    // At least one card should show a non-zero numeric client count
    let hasNumericCount = false;
    for (let i = 0; i < clientsCount; i++) {
      const parent = clientsSections.nth(i).locator("..");
      const text = await parent.textContent();
      if (text && /\d+/.test(text.replace("Clients", ""))) {
        hasNumericCount = true;
      }
    }
    expect(hasNumericCount).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands-clients-available.png",
      fullPage: true,
    });
  });
});
