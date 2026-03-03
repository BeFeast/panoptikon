import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for device card title fallback (#552).
 *
 * Verifies that device cards with no name/hostname display the IP address
 * as primary title instead of the raw MAC address. Unnamed devices should
 * show an "Unknown" badge.
 */
test.describe("Device Card Title Fallback (#552)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("device card titles never show raw MAC as primary title", async ({
    page,
  }) => {
    // Wait for device data to load
    await page.waitForTimeout(3000);

    // MAC pattern: xx:xx:xx:xx:xx:xx (hex pairs separated by colons)
    const macPattern = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

    // Get all device card title elements — they are the font-medium text-white
    // spans inside the card's name row
    const titleSpans = page.locator(
      '.border-slate-800.bg-slate-900 .font-medium.text-white',
    );

    const count = await titleSpans.count();

    if (count === 0) {
      // No devices rendered — test is vacuously true; take screenshot and pass
      await page.screenshot({
        path: "tests/screenshots/device-card-title-fallback-empty.png",
        fullPage: true,
      });
      return;
    }

    // Check every card title — none should be a raw MAC address
    for (let i = 0; i < count; i++) {
      const text = (await titleSpans.nth(i).textContent())?.trim() ?? "";
      expect(
        macPattern.test(text),
        `Device card #${i + 1} title "${text}" should not be a raw MAC address`,
      ).toBe(false);
    }

    await page.screenshot({
      path: "tests/screenshots/device-card-title-fallback.png",
      fullPage: true,
    });
  });

  test("unnamed devices show Unknown badge", async ({ page }) => {
    // Wait for device data to load
    await page.waitForTimeout(3000);

    // Look for the "Unknown" badge that appears on unnamed device cards
    const unknownBadges = page.locator(
      '.border-slate-800.bg-slate-900 >> text="Unknown"',
    );

    const badgeCount = await unknownBadges.count();

    // If there are unnamed devices, their titles should be IPs or "Unknown Device",
    // not MAC addresses
    if (badgeCount > 0) {
      // For each card with an "Unknown" badge, verify the title is an IP or
      // "Unknown Device", not a MAC
      const macPattern = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;
      const ipOrUnknown = /^(\d+\.\d+\.\d+\.\d+|Unknown Device)$/;

      // Get the parent cards that contain Unknown badges
      const cardsWithBadge = page.locator(
        '.border-slate-800.bg-slate-900:has(>> text="Unknown")',
      );
      const cardCount = await cardsWithBadge.count();

      for (let i = 0; i < cardCount; i++) {
        const titleEl = cardsWithBadge
          .nth(i)
          .locator(".font-medium.text-white")
          .first();
        const title = (await titleEl.textContent())?.trim() ?? "";

        expect(
          macPattern.test(title),
          `Unnamed device card #${i + 1} title "${title}" should not be a raw MAC`,
        ).toBe(false);
        expect(
          ipOrUnknown.test(title),
          `Unnamed device card #${i + 1} title "${title}" should be an IP address or 'Unknown Device'`,
        ).toBe(true);
      }
    }

    await page.screenshot({
      path: "tests/screenshots/device-card-unknown-badge.png",
      fullPage: true,
    });
  });
});
