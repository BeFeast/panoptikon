import { test, expect, login } from "../../e2e/fixtures";

test.describe("User Management — RBAC settings page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/users/");
    await expect(
      page.getByRole("heading", { name: "User Management" }),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("page renders with create user form", async ({ page }) => {
    await expect(page.locator("#new-username")).toBeVisible();
    await expect(page.locator("#new-password")).toBeVisible();
    await expect(page.locator("#new-role")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create User" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-users-form.png",
    });
  });

  test("create user and see it in the list", async ({ page }) => {
    const username = `e2e-user-${Date.now()}`;

    await page.locator("#new-username").fill(username);
    await page.locator("#new-password").fill("testpass1234");
    await page.locator("#new-role").selectOption("operator");

    await page.getByRole("button", { name: "Create User" }).click();
    await expect(
      page.getByText(`User "${username}" created.`),
    ).toBeVisible({ timeout: 10000 });

    // User should appear in the list
    await expect(page.getByText(username)).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-users-created.png",
    });

    // Clean up: delete the user
    const userRow = page.locator(`text=${username}`).locator("..").locator("..");
    const deleteBtn = userRow.locator('button').last();
    await deleteBtn.click();
    await expect(
      page.getByText(`User "${username}" deleted.`),
    ).toBeVisible({ timeout: 10000 });
  });

  test("validation rejects short password", async ({ page }) => {
    await page.locator("#new-username").fill("shortpw-user");
    await page.locator("#new-password").fill("short");

    await page.getByRole("button", { name: "Create User" }).click();
    await expect(
      page.getByText("Password must be at least 8 characters"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("settings page links to user management", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByText("User Management"),
    ).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/settings-users-nav.png",
    });
  });
});
