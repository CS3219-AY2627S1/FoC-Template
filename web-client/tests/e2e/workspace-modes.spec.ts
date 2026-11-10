/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Generated and refined Supplier administration mode browser regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Updated workspace navigation checks for the Order entry points.
// Author review: I validated correctness and added boundary checks where needed.

import { expect, test, type Page } from "@playwright/test";

type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

const activeSupplier = {
  id: "550e8400-e29b-41d4-a716-446655440000", name: "Cool Spot", categories: ["FOOD", "COFFEE"],
  building_area: "Com2", floor: "1", status: "ACTIVE", opening_time: "09:00", closing_time: "21:30",
  pickup_location_description: "Opp Lift", latitude: null, longitude: null, image_url: null,
  created_at: "2026-09-23T02:00:00Z", updated_at: "2026-09-23T03:00:00Z",
};
const inactiveSupplier = { ...activeSupplier, id: "550e8400-e29b-41d4-a716-446655440001", name: "Campus Books", status: "INACTIVE" };

async function mockWorkspace(page: Page, role: Role, signedIn = true) {
  let authenticated = signedIn;
  let adminRequests = 0;
  const session = { accessToken: "workspace-test-token", tokenType: "Bearer", expiresAt: "2030-01-01T00:00:00Z" };
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill(authenticated
    ? { json: session }
    : { status: 401, json: { error: { code: "INVALID_SESSION", message: "Sign in." } } }));
  await page.route("**/v1/auth/sessions", (route) => {
    authenticated = true;
    return route.fulfill({ json: session });
  });
  await page.route("**/v1/auth/sessions/current", (route) => {
    authenticated = false;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: {
    userId: "self", username: "testuser", email: "testuser@u.nus.edu", displayName: "Jihun Hwang", systemRole: role, accountStatus: "ACTIVE",
  } }));
  await page.route("**/v1/admin/admins", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/categories", (route) => route.fulfill({ json: [
    { code: "FOOD", display_name: "Food" }, { code: "COFFEE", display_name: "Coffee" },
  ] }));
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => route.fulfill({ json: {
    items: [activeSupplier], page: 1, page_size: 6, total: 1,
  } }));
  await page.route((url) => url.pathname === `/api/v1/suppliers/${activeSupplier.id}`, (route) => route.fulfill({ json: activeSupplier }));
  await page.route("**/api/v1/admin/suppliers**", (route) => {
    adminRequests += 1;
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.pathname === "/api/v1/admin/suppliers"
      ? { items: [activeSupplier, inactiveSupplier], page: 1, page_size: Number(url.searchParams.get("page_size") ?? 6), total: 2 }
      : activeSupplier });
  });
  return { getAdminRequests: () => adminRequests };
}

async function signIn(page: Page) {
  await page.getByLabel("NUS email").fill("testuser@u.nus.edu");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

async function expectMode(page: Page, mode: "User" | "Admin") {
  await expect(page.getByRole("button", { name: `${mode} mode`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: `${mode === "User" ? "Admin" : "User"} mode`, exact: true })).toHaveAttribute("aria-pressed", "false");
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function navigationLayout(page: Page, width: number) {
  const navigation = page.getByRole("navigation", { name: width < 1024 ? "Mobile navigation" : "Main navigation", exact: true });
  return navigation.getByRole("link").evaluateAll((links) => links.map((link) => {
    const { x, y, width, height } = link.getBoundingClientRect();
    return { label: link.textContent?.trim(), href: link.getAttribute("href"), x, y, width, height };
  }));
}

for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
  for (const width of [375, 1440]) {
    test(`${role} starts in User mode and switches to supplier administration at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1024 });
      const requests = await mockWorkspace(page, role, false);
      await page.goto("/sign-in");
      await signIn(page);
      await expectMode(page, "User");
      await expect(page.getByRole("link", { name: "Manage suppliers" })).toHaveCount(0);
      const manageAdmins = page.getByRole("link", { name: "Manage admins", exact: true });
      await expect(manageAdmins).toHaveCount(0);
      await expectNoOverflow(page);
      expect(requests.getAdminRequests()).toBe(0);
      const profileNavigation = await navigationLayout(page, width);
      expect(profileNavigation.map((item) => item.label)).toEqual(["Profile", "Suppliers", "Open errands", "My errands", "Wallet", "Messages"]);
      await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute("aria-current", "page");
      if (role === "SUPER_ADMIN") await page.screenshot({ path: test.info().outputPath(`profile-user-mode-${width}.png`), fullPage: true });

      await page.getByRole("link", { name: "Suppliers", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Campus suppliers" })).toBeVisible();
      await expectMode(page, "User");
      await page.getByRole("button", { name: "Admin mode", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/suppliers$/);
      await expectMode(page, "Admin");
      await expect(page.getByRole("heading", { name: "Manage suppliers", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Campus Books" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add supplier" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(2);
      await expect(page.getByRole("link", { name: /^(Suppliers|Profile)$/ })).toHaveCount(0);
      if (role === "SUPER_ADMIN") {
        await expect(manageAdmins).toBeVisible();
        await expect(manageAdmins).toHaveAttribute("href", "/admin/users");
      } else {
        await expect(manageAdmins).toHaveCount(0);
      }
      await expect(page.getByRole("link", { name: "Manage suppliers", exact: true })).toBeVisible();
      await expectNoOverflow(page);
      if (role === "SUPER_ADMIN") await page.screenshot({ path: test.info().outputPath(`admin-mode-${width}.png`), fullPage: true });

      // Selecting the current mode must not reset filters or leave the page.
      await page.getByRole("combobox", { name: "Suppliers per page" }).selectOption("50");
      await page.getByRole("button", { name: "Admin mode", exact: true }).click();
      await expect(page).toHaveURL(/page_size=50/);
      await page.reload();
      await expectMode(page, "Admin");
      await expect(page.getByRole("combobox", { name: "Suppliers per page" })).toHaveValue("50");

      await page.getByRole("button", { name: "User mode", exact: true }).click();
      await expect(page).toHaveURL(/\/suppliers$/);
      await expectMode(page, "User");
      await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Campus Books" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Manage suppliers|Add supplier|^Edit$/ })).toHaveCount(0);
      await expect(manageAdmins).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Activate|Deactivate/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
      await expectNoOverflow(page);
      await expect.poll(() => navigationLayout(page, width)).toEqual(profileNavigation);
      await expect(page.getByRole("link", { name: "Suppliers", exact: true })).toHaveAttribute("aria-current", "page");
      if (role === "SUPER_ADMIN") await page.screenshot({ path: test.info().outputPath(`user-mode-${width}.png`), fullPage: true });

      await page.getByRole("link", { name: "View Cool Spot" }).click();
      await expect(page).toHaveURL(`/suppliers/${activeSupplier.id}`);
      await expect(page.getByRole("heading", { name: "Supplier information", exact: true })).toBeVisible();
      await expectMode(page, "User");
      await expect(page.getByRole("link", { name: "Edit supplier" })).toHaveCount(0);
      // Route changes replace the shell; retry geometry reads made during that commit.
      await expect.poll(() => navigationLayout(page, width)).toEqual(profileNavigation);
      await expect(page.getByRole("link", { name: "Suppliers", exact: true })).toHaveAttribute("aria-current", "page");

      if (role === "SUPER_ADMIN") {
        await page.getByRole("button", { name: "Admin mode", exact: true }).click();
        await manageAdmins.click();
        await expect(page.getByRole("heading", { name: "Manage admins", exact: true })).toBeVisible();
        await expectMode(page, "Admin");
        await expect(manageAdmins).toHaveAttribute("aria-current", "page");
        await expect(page.getByRole("link", { name: /^(Profile|Suppliers)$/ })).toHaveCount(0);
        expect((await navigationLayout(page, width)).map((item) => item.label)).toEqual(["Dashboard", "Errands", "Disputes", "Manage suppliers", "Manage admins"]);
        await expectNoOverflow(page);
        await page.getByRole("button", { name: "User mode", exact: true }).click();
      }
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Profile and security" })).toBeVisible();
      await expectMode(page, "User");
      await expect.poll(() => navigationLayout(page, width)).toEqual(profileNavigation);
    });
  }
}

for (const width of [320, 768, 1024]) {
  test(`mode switch and navigation fit every authenticated route at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkspace(page, "SUPER_ADMIN");
    for (const path of ["/profile", "/suppliers", `/suppliers/${activeSupplier.id}`, "/admin/users", "/admin/suppliers", "/admin/suppliers/new", `/admin/suppliers/${activeSupplier.id}`, `/admin/suppliers/${activeSupplier.id}/edit`]) {
      await page.goto(path);
      const mode = path.startsWith("/admin/") ? "Admin" : "User";
      await expectMode(page, mode);
      await expect(page.getByRole("group", { name: "Workspace mode" })).toBeVisible();
      await expect(page.getByRole("button", { name: "User mode", exact: true })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Admin mode", exact: true })).toBeInViewport();
      await expect(page.getByRole("link", { name: "Manage admins", exact: true })).toHaveCount(mode === "Admin" ? 1 : 0);
      await expectNoOverflow(page);
    }
    await page.goto("/profile");
    await expectMode(page, "User");
    await page.getByRole("button", { name: "Admin mode", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
    await expectNoOverflow(page);
    await expect(page.getByRole("button", { name: "User mode", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Admin mode", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "User mode", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Campus suppliers" })).toBeVisible();
    await expectNoOverflow(page);
  });
}

test("direct admin links and browser history keep the mode correct; keyboard switching works", async ({ page }) => {
  await mockWorkspace(page, "ADMIN");
  await page.goto(`/admin/suppliers/${activeSupplier.id}/edit`);
  await expect(page.getByRole("heading", { name: "Edit supplier", exact: true })).toBeVisible();
  await expectMode(page, "Admin");
  await page.getByRole("button", { name: "User mode", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/suppliers$/);
  await expectMode(page, "User");
  await page.goBack();
  await expect(page).toHaveURL(/\/edit$/);
  await expectMode(page, "Admin");
  await page.goForward();
  await expectMode(page, "User");
});

for (const width of [375, 1440]) {
  test(`admin management stays in Admin mode across refresh and browser history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockWorkspace(page, "SUPER_ADMIN");
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Manage admins", exact: true })).toBeVisible();
    await expectMode(page, "Admin");
    await page.getByRole("button", { name: "Admin mode", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await page.reload();
    await expectMode(page, "Admin");
    await expect(page.getByRole("link", { name: "Manage admins", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "User mode", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/suppliers$/);
    await expectMode(page, "User");
    await expect(page.getByRole("link", { name: "Manage admins", exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expectMode(page, "Admin");
    await page.goForward();
    await expectMode(page, "User");
  });
}

test("signing in again after using Admin mode starts in User mode", async ({ page }) => {
  await mockWorkspace(page, "SUPER_ADMIN");
  await page.goto("/admin/suppliers");
  await expectMode(page, "Admin");
  await page.getByRole("link", { name: "Open your profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile and security" })).toBeVisible();
  await expectMode(page, "User");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page);
  await expectMode(page, "User");
  await expect(page.getByRole("link", { name: "Manage suppliers" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage admins", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Suppliers", exact: true }).click();
  await expectMode(page, "User");
});

test("normal users have no mode switch and cannot request admin data", async ({ page }) => {
  const requests = await mockWorkspace(page, "USER");
  for (const path of ["/profile", "/suppliers", "/admin/suppliers", "/admin/suppliers/new", `/admin/suppliers/${activeSupplier.id}/edit`]) {
    await page.goto(path);
    await expect(page.getByLabel("Open your profile").or(page.getByLabel("Current account"))).toBeVisible();
    await expect(page.getByRole("group", { name: "Workspace mode" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Manage suppliers|Manage admins|Add supplier/ })).toHaveCount(0);
    if (path.startsWith("/admin/")) await expect(page.getByRole("heading", { name: "Supplier management requires an administrator" })).toBeVisible();
  }
  expect(requests.getAdminRequests()).toBe(0);
});
