import { test, expect, login } from "../../e2e/fixtures";

test.describe("Alert Rules — Statistics, Reorder, Search, Schedule", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Clean up existing rules before each test
    const listRes = await page.request.get("/api/v1/alert-rules");
    if (listRes.ok()) {
      const rules = await listRes.json();
      for (const rule of rules) {
        await page.request.delete(`/api/v1/alert-rules/${rule.id}`);
      }
    }
  });

  test("alert rules page loads with heading and search bar", async ({
    page,
  }) => {
    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByPlaceholder("Search rules..."),
    ).toBeVisible();
    await page.screenshot({
      path: "tests/screenshots/alert-rules-page.png",
      fullPage: true,
    });
  });

  test("create rule via API shows hit count badge and persists on reload", async ({
    page,
  }) => {
    // Create a rule via API
    const createRes = await page.request.post("/api/v1/alert-rules", {
      data: {
        rule_type: "device_offline",
        threshold_value: 5,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const rule = await createRes.json();
    expect(rule.hit_count).toBe(0);
    expect(rule.position).toBeGreaterThanOrEqual(0);

    // Load page
    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });

    // Verify hit count badge is visible
    await expect(page.getByText("0 hits")).toBeVisible();

    // Verify rule card is visible
    await expect(page.getByText("Device Offline")).toBeVisible();

    // Reload and verify persistence
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Device Offline")).toBeVisible();
    await expect(page.getByText("0 hits")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/alert-rules-hit-counter.png",
      fullPage: true,
    });
  });

  test("search filters rules by name", async ({ page }) => {
    // Create two rules
    await page.request.post("/api/v1/alert-rules", {
      data: { rule_type: "device_offline", threshold_value: 5 },
    });
    await page.request.post("/api/v1/alert-rules", {
      data: { rule_type: "bandwidth_threshold", threshold_value: 100 },
    });

    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });

    // Both rules visible initially
    await expect(page.getByText("Device Offline")).toBeVisible();
    await expect(page.getByText("Bandwidth Threshold")).toBeVisible();

    // Type search query
    await page.getByPlaceholder("Search rules...").fill("bandwidth");

    // Only bandwidth rule visible
    await expect(page.getByText("Bandwidth Threshold")).toBeVisible();
    await expect(page.getByText("Device Offline")).not.toBeVisible();

    // Clear search
    await page.getByPlaceholder("Search rules...").fill("");
    await expect(page.getByText("Device Offline")).toBeVisible();
    await expect(page.getByText("Bandwidth Threshold")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/alert-rules-search.png",
      fullPage: true,
    });
  });

  test("reorder rules via API and verify order persists", async ({
    page,
  }) => {
    // Create two rules
    const r1 = await (
      await page.request.post("/api/v1/alert-rules", {
        data: { rule_type: "device_offline", threshold_value: 5 },
      })
    ).json();

    const r2 = await (
      await page.request.post("/api/v1/alert-rules", {
        data: { rule_type: "bandwidth_threshold", threshold_value: 100 },
      })
    ).json();

    // Reorder: bandwidth first, then device_offline
    const reorderRes = await page.request.put(
      "/api/v1/alert-rules/reorder",
      { data: { rule_ids: [r2.id, r1.id] } },
    );
    expect(reorderRes.ok()).toBeTruthy();
    const reordered = await reorderRes.json();
    expect(reordered[0].rule_type).toBe("bandwidth_threshold");
    expect(reordered[1].rule_type).toBe("device_offline");

    // Load page and verify visual order
    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });

    const cards = page.locator('[data-slot="card"]');
    await expect(cards).toHaveCount(2, { timeout: 10000 });

    // First card should have Bandwidth, second should have Device Offline
    await expect(cards.nth(0)).toContainText("Bandwidth Threshold");
    await expect(cards.nth(1)).toContainText("Device Offline");

    await page.screenshot({
      path: "tests/screenshots/alert-rules-reordered.png",
      fullPage: true,
    });
  });

  test("time-based schedule fields save and persist on reload", async ({
    page,
  }) => {
    // Create rule with schedule via API
    const createRes = await page.request.post("/api/v1/alert-rules", {
      data: {
        rule_type: "device_offline",
        threshold_value: 5,
        schedule_days: '["mon","wed","fri"]',
        schedule_start_time: "09:00",
        schedule_end_time: "17:00",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const rule = await createRes.json();
    expect(rule.schedule_days).toBe('["mon","wed","fri"]');
    expect(rule.schedule_start_time).toBe("09:00");
    expect(rule.schedule_end_time).toBe("17:00");

    // Verify GET returns schedule
    const getRes = await page.request.get("/api/v1/alert-rules");
    expect(getRes.ok()).toBeTruthy();
    const rules = await getRes.json();
    expect(rules.length).toBe(1);
    expect(rules[0].schedule_days).toBe('["mon","wed","fri"]');

    // Load page and check schedule UI renders
    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });

    // Day buttons with active state should be visible
    await expect(page.getByText("Mon")).toBeVisible();
    await expect(page.getByText("Wed")).toBeVisible();
    await expect(page.getByText("Fri")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/alert-rules-schedule.png",
      fullPage: true,
    });
  });

  test("connection limit field persists via API roundtrip", async ({
    page,
  }) => {
    const createRes = await page.request.post("/api/v1/alert-rules", {
      data: {
        rule_type: "new_device",
        connection_limit: 50,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const rule = await createRes.json();
    expect(rule.connection_limit).toBe(50);

    // Update connection limit
    const updateRes = await page.request.put(
      `/api/v1/alert-rules/${rule.id}`,
      { data: { connection_limit: 200 } },
    );
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.connection_limit).toBe(200);
  });

  test("export and import rules roundtrip", async ({ page }) => {
    // Create rules
    await page.request.post("/api/v1/alert-rules", {
      data: { rule_type: "device_offline", threshold_value: 5 },
    });
    await page.request.post("/api/v1/alert-rules", {
      data: { rule_type: "bandwidth_threshold", threshold_value: 100 },
    });

    // Export
    const exportRes = await page.request.get("/api/v1/alert-rules/export");
    expect(exportRes.ok()).toBeTruthy();
    const exported = await exportRes.json();
    expect(exported.length).toBe(2);

    // Import (replace all with just one rule)
    const importRes = await page.request.post("/api/v1/alert-rules/import", {
      data: [{ rule_type: "new_device" }],
    });
    expect(importRes.ok()).toBeTruthy();
    const imported = await importRes.json();
    expect(imported.length).toBe(1);
    expect(imported[0].rule_type).toBe("new_device");

    // Verify only one rule exists now
    const listRes = await page.request.get("/api/v1/alert-rules");
    const rules = await listRes.json();
    expect(rules.length).toBe(1);
  });

  test("drag handle is visible for reordering", async ({ page }) => {
    await page.request.post("/api/v1/alert-rules", {
      data: { rule_type: "device_offline", threshold_value: 5 },
    });

    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });

    // Grip icon for drag should be present
    await expect(page.locator("svg.lucide-grip-vertical")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/alert-rules-drag-handle.png",
      fullPage: true,
    });
  });

  test("export and import buttons are visible", async ({ page }) => {
    await page.goto("/settings/alert-rules");
    await expect(
      page.getByRole("heading", { name: "Alert Rules" }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
  });
});
