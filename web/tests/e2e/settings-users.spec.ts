import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings — User Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("User management page loads", async ({ page }) => {
    await page.goto("/settings/users");
    await expect(
      page.getByRole("heading", { name: "User Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Users & Roles")).toBeVisible();
  });

  test("Create and delete user roundtrip", async ({ page }) => {
    await page.goto("/settings/users");
    await expect(
      page.getByRole("heading", { name: "User Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open create form
    await page.getByRole("button", { name: "Add User" }).click();
    await expect(page.getByText("New User")).toBeVisible();

    // Fill form
    await page.locator("#new-username").fill("e2e-testuser");
    await page.locator("#new-display-name").fill("E2E Test");
    await page.locator("#new-email").fill("e2e@test.com");
    await page.locator("#new-password").fill("e2epassword123");
    await page.locator("#new-role").selectOption("operator");

    // Create
    await page.getByRole("button", { name: "Create User" }).click();
    await expect(page.getByText("User created.")).toBeVisible({
      timeout: 10000,
    });

    // Verify user appears in list
    await expect(page.getByText("e2e-testuser")).toBeVisible();
    await expect(page.getByText("Operator")).toBeVisible();

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByText("e2e-testuser")).toBeVisible({
      timeout: 15000,
    });

    // Delete the test user
    const userRow = page.locator("text=e2e-testuser").locator("..");
    await userRow.locator("..").getByRole("button").click();
    await expect(page.getByText('User "e2e-testuser" deleted.')).toBeVisible({
      timeout: 10000,
    });
  });

  test("User list shows existing users via API", async ({ page }) => {
    // Seed a user via API
    const createRes = await page.request.post("/api/v1/users", {
      data: {
        username: "e2e-apiuser",
        password: "apipassword123",
        role: "readonly",
        display_name: "API User",
      },
    });
    expect(createRes.ok() || createRes.status() === 201).toBeTruthy();

    await page.goto("/settings/users");
    await expect(
      page.getByRole("heading", { name: "User Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Verify user shows up
    await expect(page.getByText("e2e-apiuser")).toBeVisible({ timeout: 5000 });

    // Cleanup
    const listRes = await page.request.get("/api/v1/users");
    const users = await listRes.json();
    const testUser = users.find(
      (u: { username: string }) => u.username === "e2e-apiuser",
    );
    if (testUser) {
      await page.request.delete(`/api/v1/users/${testUser.id}`);
    }
  });
});
