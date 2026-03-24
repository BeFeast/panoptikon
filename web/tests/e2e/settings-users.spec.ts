import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings — User Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("user management page loads with heading", async ({ page }) => {
    await page.goto("/settings/users");
    await expect(
      page.getByRole("heading", { name: "User Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "tests/screenshots/settings-users-page.png",
      fullPage: true,
    });
  });

  test("create user, verify in list, then delete", async ({ page }) => {
    await page.goto("/settings/users");
    await expect(
      page.getByRole("heading", { name: "User Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add User
    await page.getByRole("button", { name: "Add User" }).click();
    await expect(page.getByText("New User")).toBeVisible();

    // Fill in user form
    await page.locator("#user-username").fill("e2euser");
    await page.locator("#user-password").fill("testpass123");
    await page.locator("#user-email").fill("e2e@test.com");
    await page.locator("#user-role").selectOption("operator");

    // Create user
    await page.getByRole("button", { name: "Create" }).click();

    // Verify user appears in list
    await expect(page.getByText("e2euser")).toBeVisible({ timeout: 10000 });
    await page.screenshot({
      path: "tests/screenshots/settings-users-created.png",
      fullPage: true,
    });

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByText("e2euser")).toBeVisible({ timeout: 15000 });

    // Delete the user via API (cleanup)
    const usersRes = await page.request.get("/api/v1/users");
    const users = await usersRes.json();
    const e2eUser = users.find(
      (u: { username: string }) => u.username === "e2euser",
    );
    if (e2eUser) {
      await page.request.delete(`/api/v1/users/${e2eUser.id}`);
    }
  });

  test("user CRUD via API roundtrip", async ({ page }) => {
    // Create
    const createRes = await page.request.post("/api/v1/users", {
      data: {
        username: "apiuser",
        password: "securepass1",
        role: "read-only",
        email: "api@test.com",
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.username).toBe("apiuser");
    expect(created.role).toBe("read-only");

    // List
    const listRes = await page.request.get("/api/v1/users");
    const users = await listRes.json();
    expect(users.some((u: { username: string }) => u.username === "apiuser")).toBeTruthy();

    // Update
    const updateRes = await page.request.put(`/api/v1/users/${created.id}`, {
      data: { role: "operator" },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.role).toBe("operator");

    // Delete
    const deleteRes = await page.request.delete(
      `/api/v1/users/${created.id}`,
    );
    expect(deleteRes.status()).toBe(204);
  });
});
