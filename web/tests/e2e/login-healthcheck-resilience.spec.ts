import { test, expect } from "../../e2e/fixtures";
import type { Route } from "@playwright/test";

const STALLED_RESPONSE_MS = 10_000;

async function stallRequest(route: Route) {
  await new Promise((resolve) => setTimeout(resolve, STALLED_RESPONSE_MS));
  await route.abort("timedout");
}

test("login reaches network idle when bootstrap APIs stall", async ({ page }) => {
  await page.route("**/api/v1/auth/status", stallRequest);
  await page.route("**/api/v1/version", stallRequest);

  await page.goto("/login/", {
    waitUntil: "networkidle",
    timeout: 7_000,
  });

  await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
  await expect(page.getByLabel("Operator")).toHaveValue("operator");

  await page.screenshot({
    path: "tests/screenshots/login-bootstrap-timeout.png",
    fullPage: true,
  });
});
