// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): regression tests for
// session handling and the authenticated/admin route guards.
// Reviewed by authors.
import { expect, test } from "@playwright/test";
import {
  ADMIN_PROFILE,
  CLIENT_PROFILE,
  fakeJwt,
  mockApi,
  seedToken,
  storedToken,
} from "../support/api-mocks";

test.describe("auth session", () => {
  test("redirects anonymous visitors from protected pages to login", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/suppliers");

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("hydrates the session from a stored token without logging in again", async ({
    page,
  }) => {
    await seedToken(page);
    const api = await mockApi(page);

    await page.goto("/suppliers");

    await expect(page).toHaveURL(/\/suppliers$/);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    // Clients get no role badge; only admins are labelled.
    await expect(page.getByText("Admin", { exact: true })).toHaveCount(0);
    expect(api.callsTo("POST", "/api/users/login")).toHaveLength(0);
    expect(api.lastCall("GET", "/api/users/me")?.authorization).toBe(
      `Bearer ${await storedToken(page)}`,
    );
  });

  test("keeps a protected page while the profile is still loading", async ({
    page,
  }) => {
    await seedToken(page);
    await mockApi(page, {
      "GET /api/users/me": async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { body: CLIENT_PROFILE };
      },
    });

    await page.goto("/suppliers");

    // A regression in the hydration state would bounce a refreshing user to
    // /login before /me resolves.
    await expect(page.locator(".mantine-Loader-root")).toBeVisible();
    await expect(page).toHaveURL(/\/suppliers$/);

    await expect(
      page.getByRole("heading", { name: "Request an Errand" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    // Clients get no role badge; only admins are labelled.
    await expect(page.getByText("Admin", { exact: true })).toHaveCount(0);
  });

  test("clears an expired token and returns to login", async ({ page }) => {
    await seedToken(page, fakeJwt({ role: "client", exp: 0 }));
    await mockApi(page, {
      "GET /api/users/me": () => ({
        status: 401,
        body: { code: "invalid_token", message: "Not authenticated" },
      }),
    });

    await page.goto("/suppliers");

    await expect(page).toHaveURL(/\/login$/);
    expect(await storedToken(page)).toBeNull();
  });

  test("logs out, clears the token and re-protects pages", async ({ page }) => {
    await seedToken(page);
    await mockApi(page);

    await page.goto("/suppliers");
    await expect(page).toHaveURL(/\/suppliers$/);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(await storedToken(page)).toBeNull();

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logs out from the profile page", async ({ page }) => {
    await seedToken(page);
    await mockApi(page);

    await page.goto("/profile");
    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(await storedToken(page)).toBeNull();
  });

  test("opens the profile from the avatar menu", async ({ page }) => {
    await seedToken(page);
    await mockApi(page);

    await page.goto("/suppliers");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Profile" }).click();

    await expect(page).toHaveURL(/\/profile$/);
  });

  test("groups requester and courier links in the header", async ({ page }) => {
    await seedToken(page);
    await mockApi(page);

    await page.goto("/suppliers");
    const nav = page.getByTestId("desktop-nav");

    await expect(nav.getByRole("link")).toHaveText([
      "Request Errand",
      "My Requests",
      "Take Errands",
      "My Deliveries",
    ]);
  });

  test("keeps clients out of admin-only routes", async ({ page }) => {
    await seedToken(page);
    await mockApi(page);

    await page.goto("/admin/suppliers");

    await expect(page).toHaveURL(/\/suppliers$/);
    await expect(
      page.getByRole("link", { name: "Manage Suppliers" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Client Accounts" }),
    ).toHaveCount(0);
  });

  test("lets admins into admin-only routes", async ({ page }) => {
    await seedToken(page, fakeJwt({ role: "admin" }));
    const api = await mockApi(page, {
      "GET /api/users/me": () => ({ body: ADMIN_PROFILE }),
    });

    await page.goto("/admin/clients");

    await expect(page).toHaveURL(/\/admin\/clients$/);
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
    expect(api.lastCall("GET", "/api/users/admin")).not.toBeUndefined();
  });
});
