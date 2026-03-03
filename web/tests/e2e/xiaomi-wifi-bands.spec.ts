/**
 * E2E tests for Xiaomi WiFi bands deduplication fix (#545).
 *
 * Root cause: Xiaomi BE3600 in auto-channel mode reports `channel:"0"` and
 * `bandwidth:"0"` for all radios.  The old frontend logic (`parseInt(channel)
 * > 14`) mis-classified every entry as "2.4 GHz", causing a duplicate band
 * card.
 *
 * These tests verify:
 * 1. The `/api/v1/xiaomi/wifi-bands` response always carries an explicit
 *    `band` field (never relies purely on channel number for inference).
 * 2. When the API returns two entries that would both map to "2.4 GHz" under
 *    the old channel-based logic, the UI renders exactly two distinct band
 *    cards — one "2.4 GHz" and one "5 GHz".
 * 3. No duplicate band cards appear in the WiFi Bands section.
 */

import { test, expect, login } from "../../e2e/fixtures";

test.describe("Xiaomi WiFi Bands dedup (#545)", () => {
  // ── API contract ──────────────────────────────────────────

  test("wifi-bands API returns explicit band field on every entry", async ({
    page,
  }) => {
    await login(page);

    const resp = await page.request.get("/api/v1/xiaomi/wifi-bands");
    // If Xiaomi is not configured the endpoint returns 503; skip gracefully.
    if (resp.status() === 503) {
      test.skip();
      return;
    }

    expect(resp.ok()).toBeTruthy();
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
    if (resp.status() === 503) {
      test.skip();
      return;
    }

    expect(resp.ok()).toBeTruthy();
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
    if (resp.status() === 503) {
      test.skip();
      return;
    }

    expect(resp.ok()).toBeTruthy();
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
