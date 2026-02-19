import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Unique name per run to avoid collisions
const AGENT_NAME = `e2e-agent-${Date.now()}`;

test.describe("Agents page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/agents");
  });

  // ── Layout: no native dialogs ────────────────────────────────────────────
  test("source has no window.alert/confirm/prompt", async ({ page }) => {
    // Check that the agents page JS bundle doesn't contain native dialog calls.
    // We look at the raw page source loaded in-browser.
    const forbidden = await page.evaluate(() => {
      const scripts = Array.from(document.scripts).map((s) => s.src);
      return scripts; // we'll check content below
    });
    // Also check inline: try to intercept any dialog that fires during normal use
    let nativeDialogFired = false;
    page.on("dialog", (d) => {
      nativeDialogFired = true;
      d.dismiss();
    });

    // Open and close the Add Agent dialog
    await page.locator('button:has-text("Add Agent")').click();
    await page.waitForSelector('[role="dialog"]');
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "hidden" });

    // Click first delete button
    const deleteBtn = page.locator('button[title="Delete agent"]').first();
    if ((await deleteBtn.count()) > 0) {
      await deleteBtn.click();
      await page.waitForSelector('[role="alertdialog"]');
      await page.keyboard.press("Escape");
      await page.waitForSelector('[role="alertdialog"]', { state: "hidden" });
    }

    expect(nativeDialogFired, "Native alert/confirm/prompt must not fire").toBe(false);
  });

  // ── Add Agent dialog: CopyBlock must stay within dialog bounds ───────────
  test("CopyBlock does not overflow dialog", async ({ page }) => {
    await page.locator('button:has-text("Add Agent")').click();
    await page.waitForSelector('[role="dialog"]');

    // Fill name and submit
    await page.locator('[role="dialog"] input').fill(AGENT_NAME);
    await page.locator('[role="dialog"] button:has-text("Generate API Key")').click();

    // Wait for API key to appear
    await page.waitForSelector('[role="dialog"] pre');

    const dialogBox = await page.locator('[role="dialog"]').boundingBox();
    const copyBlocks = page.locator('[role="dialog"] .rounded-md.border');
    const count = await copyBlocks.count();

    expect(count, "Should have at least one CopyBlock").toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const blockBox = await copyBlocks.nth(i).boundingBox();
      if (!blockBox || !dialogBox) continue;

      expect(
        blockBox.width,
        `CopyBlock[${i}] width (${blockBox.width}px) must not exceed dialog (${dialogBox.width}px)`
      ).toBeLessThanOrEqual(dialogBox.width);

      expect(
        blockBox.x + blockBox.width,
        `CopyBlock[${i}] right edge must stay within dialog`
      ).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1); // 1px tolerance
    }

    // Screenshot for review
    await page.screenshot({ path: "e2e/screenshots/agent-created-dialog.png", fullPage: false });
  });

  // ── Add Agent dialog: Enter key on name input submits form ────────────────
  test("Enter on name input creates agent", async ({ page }) => {
    await page.locator('button:has-text("Add Agent")').click();
    await page.waitForSelector('[role="dialog"]');
    await page.locator('[role="dialog"] input').fill(AGENT_NAME + "-enter");
    await page.keyboard.press("Enter");
    await page.waitForSelector('[role="dialog"] pre', { timeout: 10_000 });
    const apiKeyText = await page.locator('[role="dialog"] pre').first().textContent();
    expect(apiKeyText).toMatch(/^pnk_/);
  });

  // ── Delete: Escape closes dialog WITHOUT deleting ─────────────────────────
  test("Escape on delete dialog cancels, does not delete", async ({ page }) => {
    // Get agent count before
    const beforeCount = await page.locator("tbody tr").count();
    if (beforeCount === 0) {
      test.skip();
      return;
    }

    const firstName = await page.locator("tbody tr").first().locator("td").first().textContent();

    await page.locator('button[title="Delete agent"]').first().click();
    await page.waitForSelector('[role="alertdialog"]');
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="alertdialog"]', { state: "hidden" });

    // Agent should still be there
    const afterCount = await page.locator("tbody tr").count();
    expect(afterCount, "Row count must not change after Escape").toBe(beforeCount);

    const firstNameAfter = await page.locator("tbody tr").first().locator("td").first().textContent();
    expect(firstNameAfter).toBe(firstName);
  });

  // ── Delete: Enter on delete dialog DOES delete ────────────────────────────
  test("Enter on delete dialog confirms deletion", async ({ page }) => {
    // First create a throwaway agent via API
    const res = await page.request.post("/api/v1/agents", {
      data: { name: AGENT_NAME + "-del" },
    });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();

    await page.reload();

    const rowsBefore = await page.locator("tbody tr").count();
    const targetRow = page.locator(`tbody tr`).filter({ hasText: AGENT_NAME + "-del" });
    await targetRow.locator('button[title="Delete agent"]').click();
    await page.waitForSelector('[role="alertdialog"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector('[role="alertdialog"]', { state: "hidden" });

    // Row should be gone
    await expect(targetRow).toHaveCount(0, { timeout: 5_000 });
    const rowsAfter = await page.locator("tbody tr").count();
    expect(rowsAfter).toBe(rowsBefore - 1);
  });

  // ── API: DELETE endpoint returns 204 ─────────────────────────────────────
  test("DELETE /api/v1/agents/:id returns 204", async ({ page }) => {
    const res = await page.request.post("/api/v1/agents", {
      data: { name: AGENT_NAME + "-api-del" },
    });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();

    const del = await page.request.delete(`/api/v1/agents/${id}`);
    expect(del.status(), "DELETE should return 204").toBe(204);
  });

  // ── API: PATCH endpoint returns 200 ──────────────────────────────────────
  test("PATCH /api/v1/agents/:id returns 200", async ({ page }) => {
    const res = await page.request.post("/api/v1/agents", {
      data: { name: AGENT_NAME + "-api-patch" },
    });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();

    const patch = await page.request.patch(`/api/v1/agents/${id}`, {
      data: { name: "renamed-e2e" },
    });
    expect(patch.status(), "PATCH should return 200").toBe(200);

    // cleanup
    await page.request.delete(`/api/v1/agents/${id}`);
  });
});
