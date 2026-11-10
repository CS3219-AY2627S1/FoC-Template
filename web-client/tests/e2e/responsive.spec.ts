/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Updated shared responsive browser checks for Supplier integration.
 * Author review: I validated correctness, and added boundary checks.
 */

import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 1024 },
];

for (const viewport of viewports) {
  test(`sign-in is usable at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("NUS email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
}

test("registration fields are stacked in the requested order and align on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/register");
  await expect(page.getByLabel("Display name (Optional)")).toBeVisible();

  const geometry = await page.locator("form input").evaluateAll((inputs) =>
    inputs.map((input) => {
      const box = input.getBoundingClientRect();
      return { label: (input as HTMLInputElement).labels?.[0]?.textContent?.trim(), x: box.x, width: box.width, y: box.y };
    }),
  );
  expect(geometry.map((input) => input.label)).toEqual([
    "Display name (Optional)",
    "Username",
    "NUS email",
    "Password",
    "Confirm password",
  ]);
  expect(new Set(geometry.map((input) => input.x)).size).toBe(1);
  expect(new Set(geometry.map((input) => input.width)).size).toBe(1);
  expect(geometry.map((input) => input.y)).toEqual([...geometry.map((input) => input.y)].sort((a, b) => a - b));
});

for (const width of [375, 1440]) {
  test(`cancelling a profile edit discards the draft and validation errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: {
      accessToken: "test-token", tokenType: "Bearer", expiresAt: "2030-01-01T00:00:00Z",
    } }));
    await page.route("**/v1/users/me", (route) => route.fulfill({ json: {
      userId: "user-id", username: "testuser", email: "testuser@u.nus.edu", displayName: "Test Student",
      systemRole: "USER", accountStatus: "ACTIVE",
    } }));
    await page.goto("/profile");
    await page.getByRole("button", { name: "Edit profile", exact: true }).click();
    await page.getByRole("textbox", { name: "Display name", exact: true }).fill("Unsaved name");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Edit profile", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue("Test Student");
    await page.getByRole("textbox", { name: "Display name", exact: true }).fill("");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Edit profile", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toHaveValue("Test Student");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
