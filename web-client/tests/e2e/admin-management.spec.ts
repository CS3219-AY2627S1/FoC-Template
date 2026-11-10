import { expect, test, type Page } from "@playwright/test";

type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

const initialAdmins = [
  { userId: "self", username: "AlphaSelf", email: "self@u.nus.edu", systemRole: "SUPER_ADMIN" as Role },
  { userId: "other-super", username: "ZuluSuper", email: "super@u.nus.edu", systemRole: "SUPER_ADMIN" as Role },
  { userId: "admin", username: "CampusAdmin", email: "a-very-long-admin-email-address-for-responsive-tests@u.nus.edu", systemRole: "ADMIN" as Role },
];

async function mockSession(page: Page, role: Role = "SUPER_ADMIN") {
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: {
    accessToken: "test-token", tokenType: "Bearer", expiresAt: "2030-01-01T00:00:00Z",
  } }));
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: {
    userId: "self", username: "AlphaSelf", email: "self@u.nus.edu", displayName: "Self", systemRole: role, accountStatus: "ACTIVE",
  } }));
}

function sortedAdmins(accounts: typeof initialAdmins) {
  return accounts.filter((account) => account.systemRole !== "USER").sort((left, right) => {
    if (left.systemRole !== right.systemRole) return left.systemRole === "SUPER_ADMIN" ? -1 : 1;
    return left.username.toLowerCase() < right.username.toLowerCase() ? -1 : 1;
  });
}

for (const width of [375, 768, 1024, 1440]) {
  test(`current admins are stacked and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await mockSession(page);
    await page.route("**/v1/admin/admins", (route) => route.fulfill({ json: initialAdmins }));
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Manage admins", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage admins" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Workspace mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Admin mode", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Manage suppliers", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Profile|Suppliers)$/ })).toHaveCount(0);
    const roster = page.getByRole("region", { name: "Current super admins / admins" });
    await expect(roster.getByRole("listitem")).toHaveCount(3);
    const rows = await roster.getByRole("listitem").evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: element.getAttribute("aria-label"), x: rect.x, width: rect.width, y: rect.y, bottom: rect.bottom };
    }));
    expect(rows.map((row) => row.name)).toEqual(["AlphaSelf", "ZuluSuper", "CampusAdmin"]);
    expect(new Set(rows.map((row) => row.x)).size).toBe(1);
    expect(new Set(rows.map((row) => row.width)).size).toBe(1);
    expect(rows[1].y).toBeGreaterThan(rows[0].bottom);
    expect(rows[2].y).toBeGreaterThan(rows[1].bottom);
    await expect(roster.getByRole("listitem", { name: "AlphaSelf" }).getByRole("combobox")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`manage-admins-${width}.png`), fullPage: true });
  });
}

for (const role of ["USER", "ADMIN"] as const) {
  test(`${role} cannot navigate to account administration`, async ({ page }) => {
    await mockSession(page, role);
    let adminRequests = 0;
    await page.route("**/v1/admin/admins", (route) => {
      adminRequests += 1;
      return route.fulfill({ json: initialAdmins });
    });
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("link", { name: "Manage admins" })).toHaveCount(0);
    expect(adminRequests).toBe(0);
  });
}

test("anonymous visitors must sign in before opening account administration", async ({ page }) => {
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ status: 401, json: { error: { code: "INVALID_SESSION", message: "Sign in." } } }));
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("Admins retain Supplier management access", async ({ page }) => {
  await mockSession(page, "ADMIN");
  await page.route("**/api/v1/categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/admin/suppliers*", (route) => route.fulfill({ json: { items: [], page: 1, page_size: 6, total: 0 } }));
  await page.goto("/admin/suppliers");
  await expect(page.getByRole("link", { name: "Manage suppliers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supplier management requires an administrator" })).toHaveCount(0);
});

test("a confirmed list role change refreshes and reorders the list", async ({ page }) => {
  await mockSession(page);
  const admins = initialAdmins.map((account) => ({ ...account }));
  let listRequests = 0;
  let roleChanges = 0;
  await page.route("**/v1/admin/admins", (route) => {
    listRequests += 1;
    return route.fulfill({ json: sortedAdmins(admins) });
  });
  await page.route("**/v1/admin/users/admin/system-role", (route) => {
    const systemRole = route.request().postDataJSON().systemRole as Role;
    admins[2].systemRole = systemRole;
    roleChanges += 1;
    return route.fulfill({ json: { userId: "admin", systemRole, roleVersion: roleChanges + 1 } });
  });
  await page.goto("/admin/users");
  const row = page.getByRole("listitem", { name: "CampusAdmin" });
  await expect(row).toBeVisible();
  const initialListRequests = listRequests;
  await row.getByRole("combobox").selectOption("SUPER_ADMIN");
  await row.getByRole("button", { name: "Review role change" }).click();
  expect(roleChanges).toBe(0);
  await page.getByRole("dialog").getByRole("button", { name: "Change access level" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("listitem").nth(1)).toHaveAttribute("aria-label", "CampusAdmin");
  expect(roleChanges).toBe(1);
  expect(listRequests).toBe(initialListRequests + 1);

  await row.getByRole("combobox").selectOption("USER");
  await row.getByRole("button", { name: "Review role change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Change access level" }).click();
  await expect(row).toHaveCount(0);
  expect(roleChanges).toBe(2);
});
