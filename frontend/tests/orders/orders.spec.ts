// AI-assisted (Claude Opus 5.5): regression tests for the order pages and header
// tweaks — one Cancel button, clickable rows, names instead of ids, readable
// statuses, Take Errands filters and the credits badge. Reviewed by authors.
import { expect, test } from "@playwright/test";
import { CLIENT_PROFILE, mockApi, seedToken } from "../support/api-mocks";
import { makeSupplier, supplierList } from "../support/suppliers";

const ME = CLIENT_PROFILE.id;
const COURIER = "55555555-5555-5555-5555-555555555555";

function order(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "order-open",
    name: "Coffee run",
    details: "Iced latte, less sugar",
    reward: 5,
    deadline: "2026-12-01T10:00:00",
    supplier_id: "sup-1",
    requester_id: ME,
    courier_id: null,
    pickup_location: "COM3",
    delivery_location: "COM1",
    status: "OPEN",
    created_at: "2026-11-09T09:00:00",
    ...overrides,
  };
}

const ACCEPTED = order({
  order_id: "order-accepted",
  name: "Printing",
  status: "ACCEPTED",
  courier_id: COURIER,
});

const COMMON = {
  [`GET /api/suppliers/sup-1`]: () => ({ body: makeSupplier() }),
  [`GET /api/users/${COURIER}/public`]: () => ({
    body: { id: COURIER, display_name: "Charles Babbage" },
  }),
  [`GET /api/credits/${ME}/balance`]: () => ({
    body: { user_id: ME, available_balance: 100, reserved_balance: 0 },
  }),
  "GET /api/orders/requested/completed": () => ({ body: [] }),
};

test.describe("orders", () => {
  test("an order nobody accepted has one Cancel button, which removes it", async ({ page }) => {
    await seedToken(page);
    let removed = false;
    const api = await mockApi(page, {
      ...COMMON,
      "GET /api/orders/requested/ongoing": () => ({
        body: removed ? [ACCEPTED] : [order(), ACCEPTED],
      }),
      "DELETE /api/orders/order-open": () => {
        removed = true;
        return {
          status: 202,
          body: { task_id: "t-1", order_id: "order-open", status: "pending" },
        };
      },
      "GET /api/orders/deletions/t-1": () => ({
        body: { task_id: "t-1", order_id: "order-open", status: "completed" },
      }),
    });

    await page.goto("/orders/mine");
    const rows = page.getByTestId("order-row");
    await expect(rows).toHaveCount(2);
    const openRow = rows.filter({ hasText: "Coffee run" });

    await expect(openRow.getByText("Finding a courier")).toBeVisible();
    await expect(openRow.getByText("Coffee Bean")).toBeVisible();
    await expect(openRow.getByText("Courier: Not assigned yet")).toBeVisible();
    await expect(openRow.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(rows.filter({ hasText: "Printing" })).toContainText(
      "Courier: Charles Babbage",
    );

    await openRow.getByRole("button", { name: "Cancel" }).click();
    // Clicking a button inside the row does not open the order.
    await expect(page).toHaveURL(/\/orders\/mine$/);
    const dialog = page.getByRole("dialog", { name: "Cancel request" });
    await expect(dialog).toContainText("Nobody has accepted");
    await dialog.getByRole("button", { name: "Cancel request" }).click();

    await expect(page.getByText("Request cancelled and removed")).toBeVisible();
    await expect(rows).toHaveCount(1);
    expect(api.callsTo("DELETE", "/api/orders/order-open")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/orders/order-open/cancel")).toHaveLength(0);
  });

  test("an accepted order still asks for a cancellation reason", async ({ page }) => {
    await seedToken(page);
    await mockApi(page, {
      ...COMMON,
      "GET /api/orders/requested/ongoing": () => ({ body: [ACCEPTED] }),
    });

    await page.goto("/orders/mine");
    await page.getByRole("button", { name: "Cancel" }).click();

    const dialog = page.getByRole("dialog", { name: "Cancel request" });
    await expect(dialog.getByLabel("Reason")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Confirm Cancel" })).toBeDisabled();
  });

  test("clicking a row opens the order with names instead of ids", async ({ page }) => {
    await seedToken(page);
    await mockApi(page, {
      ...COMMON,
      "GET /api/orders/requested/ongoing": () => ({ body: [ACCEPTED] }),
      "GET /api/orders/order-accepted": () => ({ body: ACCEPTED }),
    });

    await page.goto("/orders/mine");
    await page.getByTestId("order-row").click();

    await expect(page).toHaveURL(/\/orders\/order-accepted$/);
    await expect(page.getByRole("heading", { name: "Printing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Coffee Bean" })).toHaveAttribute(
      "href",
      "/suppliers/sup-1",
    );
    await expect(page.getByText("COM3, Level 1 · Near the entrance")).toBeVisible();
    await expect(page.getByText("Open 08:00 – 20:00")).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toBeVisible();
    await expect(page.getByText("Charles Babbage")).toBeVisible();
    // Readable timeline, no raw ids or SCREAMING_CASE statuses.
    await expect(page.getByText("Heading to vendor")).toBeVisible();
    await expect(page.getByText("Awaiting confirmation")).toBeVisible();
    await expect(page.getByText("AWAITING_APPROVAL")).toHaveCount(0);
    await expect(page.getByText(COURIER)).toHaveCount(0);
    await expect(page.getByText("sup-1", { exact: true })).toHaveCount(0);
  });

  test("Take Errands filters with the supplier-page layout and searches in place", async ({
    page,
  }) => {
    await seedToken(page);
    const someoneElse = "66666666-6666-6666-6666-666666666666";
    const api = await mockApi(page, {
      ...COMMON,
      "GET /api/suppliers": () => ({ body: supplierList([makeSupplier()]) }),
      "GET /api/orders": () => ({
        body: [
          order({ requester_id: someoneElse }),
          order({ order_id: "o-2", name: "Print notes", requester_id: someoneElse }),
        ],
      }),
    });

    await page.goto("/errands");
    await expect(page.getByRole("heading", { name: "Take Errands" })).toBeVisible();
    await expect(page.getByText("2 errands")).toBeVisible();

    await page.getByPlaceholder("Search errands...").fill("print");
    await expect(page.getByText("1 errand", { exact: true })).toBeVisible();
    await expect(page.getByText("Coffee run")).toHaveCount(0);

    await page.getByPlaceholder("All categories").click();
    await page.getByRole("option", { name: "Printing" }).click();
    await expect
      .poll(() => api.lastCall("GET", "/api/orders")?.query.category)
      .toEqual(["Printing"]);

    await page.getByText("Reward", { exact: true }).click();
    await expect.poll(() => api.lastCall("GET", "/api/orders")?.query.sort_by).toEqual([
      "reward",
    ]);
  });

  test("the credits badge hides reserved credits when there are none", async ({ page }) => {
    await seedToken(page);
    let reserved = 0;
    await mockApi(page, {
      ...COMMON,
      [`GET /api/credits/${ME}/balance`]: () => ({
        body: { user_id: ME, available_balance: 100, reserved_balance: reserved },
      }),
      [`GET /api/credits/${ME}/transactions`]: () => ({ body: [] }),
    });

    await page.goto("/suppliers");
    await expect(page.getByTestId("credits-badge")).toHaveText("100 avail");

    reserved = 4;
    await page.reload();
    await expect(page.getByTestId("credits-badge")).toHaveText("100 avail | 4 rsv");
    await page.getByTestId("credits-badge").hover();
    await expect(page.getByText("held for your open requests")).toBeVisible();

    await page.getByTestId("credits-badge").click();
    await expect(page).toHaveURL(/\/profile#credits$/);
  });
});
