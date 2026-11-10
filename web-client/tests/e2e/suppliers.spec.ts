/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated and refined Supplier browsing/management browser regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { expect, test, type Page } from "@playwright/test";

const supplierId = "550e8400-e29b-41d4-a716-446655440000";

async function mockSupplierSession(page: Page, role: "USER" | "ADMIN" = "USER") {
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: {
    accessToken: "valid-test-token", tokenType: "Bearer", expiresAt: "2030-01-01T00:00:00Z",
  } }));
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: {
    userId: "user-id", username: "testuser", email: "testuser@u.nus.edu", displayName: "Jihun Hwang", systemRole: role, accountStatus: "ACTIVE",
  } }));
  await page.route("**/api/v1/categories", (route) => route.fulfill({ json: [
    { code: "FOOD", display_name: "Food" }, { code: "COFFEE", display_name: "Coffee" },
  ] }));
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => route.fulfill({ json: {
    items: [{ id: supplierId, name: "Cool Spot", categories: ["FOOD", "COFFEE"], building_area: "Com2", floor: "1", status: "ACTIVE", opening_time: "09:00", closing_time: "21:30" }],
    page: 1, page_size: 6, total: 1,
  } }));
  await page.route((url) => url.pathname === `/api/v1/suppliers/${supplierId}`, (route) => route.fulfill({ json: {
    id: supplierId, name: "Cool Spot", categories: ["FOOD", "COFFEE"], building_area: "Com2", floor: "1", pickup_location_description: "Opp Lift", latitude: 1.294, longitude: 103.773, image_url: null, status: "ACTIVE", opening_time: "09:00", closing_time: "21:30", created_at: "2026-09-23T02:00:00Z", updated_at: "2026-09-23T03:00:00Z",
  } }));
}

for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 1024 }]) {
  test(`supplier browsing and detail remain usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockSupplierSession(page);
    await page.goto("/suppliers");
    await expect(page.getByRole("heading", { name: "Campus suppliers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
    await page.getByRole("link", { name: "View Cool Spot" }).click();
    await expect(page.getByText("Opp Lift").first()).toBeVisible();
    await expect(page.getByText("09:00–21:30")).toBeVisible();
    await expect(page.getByText("Food / Coffee").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (viewport.width === 375) await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  });
}

for (const viewport of [{ width: 320, height: 640 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 1024 }]) {
  test(`supplier management list fits at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockSupplierSession(page, "ADMIN");
    await page.route((url) => url.pathname === "/api/v1/admin/suppliers", (route) => route.fulfill({ json: {
      items: Array.from({ length: 6 }, (_, index) => ({
        id: `supplier-${index}`, name: `Supplier ${index + 1}`, categories: ["FOOD", "COFFEE"], building_area: "Faculty of Arts and Social Sciences",
        floor: "1", status: index === 2 ? "INACTIVE" : "ACTIVE", opening_time: null, closing_time: null,
      })),
      page: 1, page_size: 6, total: 13,
    } }));
    await page.goto("/admin/suppliers");
    await expect(page.getByRole("heading", { name: "Supplier 6" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const target of await page.locator(".supplier-admin-actions a, .supplier-admin-actions button, .supplier-card-link").all()) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    }
  });
}

test("supplier filter controls line up on a touch phone", async ({ browser }) => {
  // Touch screens get taller controls; the custom category summary must stay centred like the native select.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await mockSupplierSession(page);
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  const centre = (box: { y: number; height: number } | null) => box!.y + box!.height / 2;
  const categoryText = centre(await page.locator(".supplier-category-picker summary > span").boundingBox());
  const sort = await page.getByRole("button", { name: /^Sort: Name/ }).boundingBox();
  expect(sort!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(categoryText - centre(sort))).toBeLessThanOrEqual(1);
  await context.close();
});

test("category menu closes when the user moves to another control or presses Escape", async ({ page }) => {
  await mockSupplierSession(page);
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  const summary = page.locator(".supplier-category-picker summary");
  const food = page.getByRole("checkbox", { name: "Food" });
  await summary.click();
  await food.click();
  await expect(food).toBeVisible();
  await page.getByRole("button", { name: /^Sort: Name/ }).click();
  await expect(food).toBeHidden();
  await summary.click();
  await expect(food).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(food).toBeHidden();
  await expect(summary).toBeFocused();
});

test("supplier list explains a service failure and recovers on retry", async ({ page }) => {
  await mockSupplierSession(page);
  let unavailable = true;
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => unavailable
    ? route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Supplier Service is temporarily unavailable." } } })
    : route.fulfill({ json: {
        items: [{ id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null, status: "ACTIVE", opening_time: null, closing_time: null }],
        page: 1, page_size: 6, total: 1,
      } }));
  await page.goto("/suppliers");
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "Suppliers could not load" })).toBeVisible();
  await expect(alert).toContainText("Supplier Service is temporarily unavailable.");
  await expect(page.getByRole("combobox", { name: "Suppliers per page" })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search suppliers" })).toBeEnabled();
  unavailable = false;
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("supplier list reports a lost connection without a raw error", async ({ page }) => {
  await mockSupplierSession(page);
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => route.abort("internetdisconnected"));
  await page.goto("/suppliers");
  await expect(page.getByRole("alert")).toContainText("Check your connection and try again.");
});

test("an unsupported filter in the link offers Clear filters instead of a retry", async ({ page }) => {
  await mockSupplierSession(page);
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => new URL(route.request().url()).searchParams.has("category")
    ? route.fulfill({ status: 422, json: { error: { code: "VALIDATION_ERROR", message: "Supplier data is invalid", fields: [{ field: "category", message: "Unsupported category: BOGUS" }] } } })
    : route.fulfill({ json: {
        items: [{ id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null, status: "ACTIVE", opening_time: null, closing_time: null }],
        page: 1, page_size: 6, total: 1,
      } }));
  await page.goto("/suppliers?category=BOGUS&sort=desc");
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "These filters cannot be used" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await alert.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await expect(page).not.toHaveURL(/category=/);
  await expect(page).toHaveURL(/sort=desc/);
});

test("a malformed supplier ID reads as not found without a retry", async ({ page }) => {
  await mockSupplierSession(page);
  await page.route((url) => url.pathname === "/api/v1/suppliers/not-a-uuid", (route) => route.fulfill({
    status: 422, json: { error: { code: "VALIDATION_ERROR", message: "Supplier data is invalid", fields: [{ field: "supplier_id", message: "Input should be a valid UUID" }] } },
  }));
  await page.goto("/suppliers/not-a-uuid");
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "Supplier not found" })).toBeVisible();
  await expect(alert).toContainText("This supplier may have been deactivated or is no longer available.");
  await expect(alert).not.toContainText("Supplier data is invalid");
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("category failure keeps suppliers visible and retries only categories", async ({ page }) => {
  await mockSupplierSession(page);
  let categoriesDown = true;
  let listRequests = 0;
  await page.route("**/api/v1/categories", (route) => categoriesDown
    ? route.fulfill({ status: 500, body: "Internal Server Error", contentType: "text/plain" })
    : route.fulfill({ json: [{ code: "FOOD", display_name: "Food" }] }));
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => {
    listRequests += 1;
    return route.fulfill({ json: {
      items: [{ id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null, status: "ACTIVE", opening_time: null, closing_time: null }],
      page: 1, page_size: 6, total: 1,
    } });
  });
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await page.locator(".supplier-category-picker summary").click();
  await expect(page.getByText("Categories could not load.")).toBeVisible();
  const requestsBeforeRetry = listRequests;
  categoriesDown = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("checkbox", { name: "Food" })).toBeVisible();
  await expect(page.getByText("Categories could not load.")).toHaveCount(0);
  expect(listRequests).toBe(requestsBeforeRetry);
});

test("an unsupported page size in the URL falls back instead of failing validation", async ({ page }) => {
  await mockSupplierSession(page);
  const requested: string[] = [];
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => {
    requested.push(new URL(route.request().url()).searchParams.get("page_size") ?? "");
    return route.fulfill({ json: {
      items: [{ id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null, status: "ACTIVE", opening_time: null, closing_time: null }],
      page: 1, page_size: 6, total: 1,
    } });
  });
  await page.goto("/suppliers?page_size=500");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Suppliers per page" })).toHaveValue("6");
  expect(requested.length).toBeGreaterThan(0);
  expect(new Set(requested)).toEqual(new Set(["6"]));
});

test("search and filters apply automatically without losing one another", async ({ page }) => {
  await mockSupplierSession(page);
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search suppliers" }).fill("cool");
  await page.locator(".supplier-category-picker summary").click();
  await page.getByRole("checkbox", { name: "Food" }).click();
  await expect(page).toHaveURL(/category=FOOD/);
  await page.getByRole("button", { name: "Sort: Name A–Z. Switch to Z–A" }).click();
  await expect(page).toHaveURL(/q=cool/);
  const query = new URL(page.url()).searchParams;
  expect(query.get("q")).toBe("cool");
  expect(query.has("building_area")).toBe(false);
  expect(query.getAll("category")).toEqual(["FOOD"]);
  expect(query.get("sort")).toBe("desc");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("searchbox", { name: "Search suppliers" })).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("sort")).toBe("desc");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  expect(new URL(page.url()).searchParams.has("category")).toBe(false);
});

test("sort button flips between name orders and keeps the other filters", async ({ page }) => {
  await mockSupplierSession(page);
  await page.goto("/suppliers?category=FOOD&page=2");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await page.getByRole("button", { name: "Sort: Name A–Z. Switch to Z–A" }).click();
  await expect(page).toHaveURL(/sort=desc/);
  let params = new URL(page.url()).searchParams;
  expect(params.getAll("category")).toEqual(["FOOD"]);
  expect(params.has("page")).toBe(false);
  await page.getByRole("button", { name: "Sort: Name Z–A. Switch to A–Z" }).click();
  await expect(page).not.toHaveURL(/sort=/);
  params = new URL(page.url()).searchParams;
  expect(params.getAll("category")).toEqual(["FOOD"]);
});

test("clearing supplier filters keeps the selected page size and sort order", async ({ page }) => {
  await mockSupplierSession(page);
  await page.goto("/suppliers?q=cool&category=FOOD&page_size=50&sort=desc");
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("combobox", { name: "Suppliers per page" })).toHaveValue("50");
  await expect(page.getByRole("button", { name: "Sort: Name Z–A. Switch to A–Z" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search suppliers" })).toHaveValue("");
  const params = new URL(page.url()).searchParams;
  expect(params.get("page_size")).toBe("50");
  expect(params.get("sort")).toBe("desc");
  expect(params.has("q")).toBe(false);
  expect(params.has("category")).toBe(false);
});

for (const admin of [false, true]) {
  test(`out-of-range supplier pages recover in ${admin ? "admin" : "user"} view`, async ({ page }) => {
    await mockSupplierSession(page, admin ? "ADMIN" : "USER");
    const endpoint = admin ? "/api/v1/admin/suppliers" : "/api/v1/suppliers";
    await page.route((url) => url.pathname === endpoint, (route) => {
      const params = new URL(route.request().url()).searchParams;
      const currentPage = Number(params.get("page") ?? 1);
      const items = currentPage === 1 ? [{
        id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null,
        status: "ACTIVE", opening_time: null, closing_time: null,
      }] : [];
      return route.fulfill({ json: { items, page: currentPage, page_size: 6, total: 1 } });
    });
    await page.goto(`${admin ? "/admin" : ""}/suppliers?page=2&category=FOOD&sort=desc`);
    await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
    await expect(page.getByText("Showing 1–1 of 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
    const params = new URL(page.url()).searchParams;
    expect(params.has("page")).toBe(false);
    expect(params.getAll("category")).toEqual(["FOOD"]);
    expect(params.get("sort")).toBe("desc");
  });
}

for (const admin of [false, true]) {
  test(`long supplier labels and selected categories fit mobile ${admin ? "admin" : "user"} view`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockSupplierSession(page, admin ? "ADMIN" : "USER");
    await page.route("**/api/v1/categories", (route) => route.fulfill({ json: [
      { code: "FOOD", display_name: "Food and takeaway meals" },
      { code: "COFFEE", display_name: "Coffee and refreshments" },
      { code: "STATIONERY", display_name: "Books and stationery" },
    ] }));
    const endpoint = admin ? "/api/v1/admin/suppliers" : "/api/v1/suppliers";
    await page.route((url) => url.pathname === endpoint, (route) => route.fulfill({ json: {
      items: [{ id: supplierId, name: "CampusSupplier".repeat(8), categories: ["FOOD", "COFFEE", "STATIONERY"],
        building_area: "CampusBuilding".repeat(8), floor: null, status: "ACTIVE", opening_time: null, closing_time: null }],
      page: 1, page_size: 6, total: 1,
    } }));
    await page.goto(`${admin ? "/admin" : ""}/suppliers`);
    await expect(page.getByRole("heading", { name: "CampusSupplier".repeat(8) })).toBeVisible();
    await page.locator(".supplier-category-picker summary").click();
    for (const name of ["Food and takeaway meals", "Coffee and refreshments", "Books and stationery"]) {
      const checkbox = page.getByRole("checkbox", { name });
      await checkbox.click();
      await expect(checkbox).toBeChecked();
    }
    await expect(page).toHaveURL(/category=STATIONERY/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const admin of [false, true]) {
  test(`supplier page size remains available for every option in ${admin ? "admin" : "user"} view`, async ({ page }) => {
    await mockSupplierSession(page, admin ? "ADMIN" : "USER");
    const endpoint = admin ? "/api/v1/admin/suppliers" : "/api/v1/suppliers";
    const suppliers = Array.from({ length: 13 }, (_, index) => ({
      id: `supplier-${index}`, name: `Supplier ${index + 1}`, categories: ["FOOD"], building_area: "Com2", floor: null,
      status: "ACTIVE", opening_time: null, closing_time: null,
    }));
    await page.route((url) => url.pathname === endpoint, (route) => {
      const params = new URL(route.request().url()).searchParams;
      const currentPage = Number(params.get("page") ?? 1);
      const pageSize = Number(params.get("page_size") ?? 6);
      const matches = params.get("q") ? [] : suppliers;
      return route.fulfill({ json: {
        items: matches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        page: currentPage, page_size: pageSize, total: matches.length,
      } });
    });
    await page.goto(admin ? "/admin/suppliers" : "/suppliers");
    const selector = page.getByRole("combobox", { name: "Suppliers per page" });
    const previous = page.getByRole("button", { name: "Previous", exact: true });
    const next = page.getByRole("button", { name: "Next", exact: true });
    await expect(selector).toBeVisible();
    await next.click();
    await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();

    for (const size of [12, 20, 50, 6]) {
      await selector.selectOption(String(size));
      await expect(selector).toBeVisible();
      await expect(selector).toBeEnabled();
      await expect(selector).toHaveValue(String(size));
      await expect(page.getByText(`Page 1 of ${Math.ceil(suppliers.length / size)}`, { exact: true })).toBeVisible();
      await expect(previous).toBeDisabled();
      if (size >= suppliers.length) await expect(next).toBeDisabled();
      else await expect(next).toBeEnabled();
      expect(new URL(page.url()).searchParams.has("page")).toBe(false);
    }

    await page.getByRole("searchbox", { name: "Search suppliers" }).fill("no matches");
    await expect(page.getByRole("heading", { name: "No suppliers found" })).toBeVisible();
    await expect(selector).toBeVisible();
    await selector.selectOption("50");
    await expect(selector).toBeEnabled();
    await expect(selector).toHaveValue("50");
    await expect(previous).toBeDisabled();
    await expect(next).toBeDisabled();
  });
}

test("normal users cannot open Supplier management pages", async ({ page }) => {
  await mockSupplierSession(page);
  await page.goto("/admin/suppliers");
  await expect(page.getByRole("heading", { name: "Supplier management requires an administrator" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage suppliers" })).toHaveCount(0);
});

test("admin listing includes inactive suppliers and applies the status filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await mockSupplierSession(page, "ADMIN");
  await page.route((url) => url.pathname === "/api/v1/admin/suppliers", (route) => {
    const status = new URL(route.request().url()).searchParams.get("status");
    const items = [
      { id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null, status: "ACTIVE", opening_time: "09:00", closing_time: "21:30" },
      { id: "550e8400-e29b-41d4-a716-446655440001", name: "Former Cafe", categories: ["COFFEE"], building_area: "Central Library", floor: null, status: "INACTIVE", opening_time: null, closing_time: null },
    ].filter((item) => !status || item.status === status);
    return route.fulfill({ json: { items, page: 1, page_size: 6, total: items.length } });
  });
  await page.goto("/admin/suppliers");
  await expect(page.getByRole("heading", { name: "Former Cafe" })).toBeVisible();
  const status = page.getByRole("group", { name: "Supplier status" });
  await expect(status.getByRole("radio", { name: "All" })).toBeChecked();
  await status.getByText("Inactive", { exact: true }).click();
  await expect(page).toHaveURL(/status=INACTIVE/);
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Former Cafe" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("admin status filter is one tap on a phone and clears with the other filters", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await mockSupplierSession(page, "ADMIN");
  await page.route((url) => url.pathname === "/api/v1/admin/suppliers", (route) => route.fulfill({ json: {
    items: [{ id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null, status: "ACTIVE", opening_time: null, closing_time: null }],
    page: 1, page_size: 6, total: 1,
  } }));
  await page.goto("/admin/suppliers?page=2");
  const status = page.getByRole("group", { name: "Supplier status" });
  const panel = await page.locator(".supplier-filter-panel").boundingBox();
  const group = await status.boundingBox();
  expect(group!.width).toBeGreaterThan(panel!.width - 40);
  for (const name of ["All", "Active", "Inactive"]) {
    expect((await status.locator("label", { hasText: new RegExp(`^${name}$`) }).boundingBox())!.height).toBeGreaterThanOrEqual(38);
  }
  await status.getByText("Active", { exact: true }).tap();
  await expect(page).toHaveURL(/status=ACTIVE/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(status.getByRole("radio", { name: "Active", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Clear filters" }).tap();
  await expect(status.getByRole("radio", { name: "All" })).toBeChecked();
  expect(new URL(page.url()).searchParams.has("status")).toBe(false);
  await context.close();
});

test("supplier form validates required fields and 24-hour times before posting", async ({ page }) => {
  await mockSupplierSession(page, "ADMIN");
  let postCount = 0;
  await page.route((url) => url.pathname === "/api/v1/admin/suppliers", (route) => {
    if (route.request().method() === "POST") postCount += 1;
    return route.fulfill({ json: { items: [], page: 1, page_size: 6, total: 0 } });
  });
  await page.goto("/admin/suppliers/new");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByText("Enter a supplier name.")).toBeVisible();
  await expect(page.getByText("Select at least one category.")).toBeVisible();
  await page.getByRole("textbox", { name: "Opening time (optional)" }).fill("9:00");
  await page.getByRole("textbox", { name: "Closing time (optional)" }).fill("18:00");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByText("Use 24-hour HH:mm, such as 09:00.")).toBeVisible();
  expect(postCount).toBe(0);
});

test("edit form waits for supplier data and offers retry after a load failure", async ({ page }) => {
  await mockSupplierSession(page, "ADMIN");
  let unavailable = true;
  await page.route((url) => url.pathname === `/api/v1/admin/suppliers/${supplierId}`, (route) => {
    return unavailable
      ? route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Supplier Service is temporarily unavailable." } } })
      : route.fulfill({ json: {
          id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null,
          pickup_location_description: "Opp Lift", latitude: null, longitude: null, image_url: null,
          status: "ACTIVE", opening_time: "09:00", closing_time: "21:30",
          created_at: "2026-09-23T02:00:00Z", updated_at: "2026-09-23T03:00:00Z",
        } });
  });
  await page.goto(`/admin/suppliers/${supplierId}/edit`);
  await expect(page.getByRole("heading", { name: "Supplier form could not load" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox", { name: "Supplier name *" })).toHaveValue("Cool Spot");
});

test("admin creates, edits, and deactivates a supplier through live API contracts", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockSupplierSession(page, "ADMIN");
  let saved = {
    id: supplierId, name: "Cool Spot", categories: ["FOOD"], building_area: "Com2", floor: null,
    pickup_location_description: "Opp Lift", latitude: null, longitude: null, image_url: null,
    status: "ACTIVE", opening_time: "09:00", closing_time: "21:30",
    created_at: "2026-09-23T02:00:00Z", updated_at: "2026-09-23T03:00:00Z",
  };
  const writes: Array<{ method: string; body?: Record<string, unknown> }> = [];
  await page.route((url) => url.pathname === "/api/v1/admin/suppliers", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push({ method: "POST", body });
      saved = { ...saved, ...body } as typeof saved;
      return route.fulfill({ status: 201, json: saved });
    }
    return route.fulfill({ json: { items: [], page: 1, page_size: 6, total: 0 } });
  });
  await page.route((url) => url.pathname === `/api/v1/admin/suppliers/${supplierId}`, (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push({ method, body });
      saved = { ...saved, ...body } as typeof saved;
      return route.fulfill({ json: saved });
    }
    if (method === "DELETE") {
      writes.push({ method });
      saved.status = "INACTIVE";
      return route.fulfill({ json: { id: supplierId, outcome: "DEACTIVATED" } });
    }
    return route.fulfill({ json: saved });
  });

  await page.goto("/admin/suppliers");
  await page.getByRole("link", { name: "+ Add supplier", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add supplier" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("textbox", { name: "Supplier name *" }).fill("Cool Spot");
  await page.getByRole("textbox", { name: "Building / campus area *" }).fill("Com2");
  await page.getByRole("textbox", { name: "Pickup location description *" }).fill("Opp Lift");
  await page.getByRole("checkbox", { name: "Food" }).click();
  await page.getByRole("textbox", { name: "Opening time (optional)" }).fill("09:00");
  await page.getByRole("textbox", { name: "Closing time (optional)" }).fill("21:30");
  await page.getByRole("button", { name: "Create supplier" }).click();
  await expect(page.getByRole("heading", { name: "Cool Spot" })).toBeVisible();
  expect(writes[0]).toMatchObject({ method: "POST", body: { categories: ["FOOD"], opening_time: "09:00", closing_time: "21:30" } });

  await page.getByRole("link", { name: "Edit supplier" }).click();
  await page.getByRole("textbox", { name: "Supplier name *" }).fill("Cool Spot Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Cool Spot Updated" })).toBeVisible();
  expect(writes[1]).toMatchObject({ method: "PATCH", body: { name: "Cool Spot Updated" } });

  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Deactivate supplier?" })).toContainText("record will be retained");
  await page.getByRole("button", { name: "Deactivate supplier" }).click();
  await expect(page.getByRole("status").filter({ hasText: "was deactivated" })).toContainText("was deactivated");
  await expect(page.getByText("Inactive", { exact: true })).toBeVisible();
  expect(writes[2]).toMatchObject({ method: "DELETE" });
});
