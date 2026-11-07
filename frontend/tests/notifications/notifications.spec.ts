import { expect, test } from "@playwright/test";
import { CLIENT_PROFILE, mockApi, seedToken } from "../support/api-mocks";

const USER = CLIENT_PROFILE.id;
const NLIST = `/api/notifications/${USER}`;
const INDICATOR = ".mantine-Indicator-indicator";

function notif(overrides: Record<string, unknown> = {}) {
  return {
    notification_id: "n-1",
    event_type: "ORDER_ACCEPTED",
    order_id: "order-1",
    order_name: "Coffee run",
    order_status: "ACCEPTED",
    title: "Order accepted",
    body: "A courier accepted your order.",
    created_at: "2026-11-06T10:00:00",
    read_at: null,
    ...overrides,
  };
}

const ORDER = {
  order_id: "order-1",
  name: "Coffee run",
  details: "Latte",
  reward: 5,
  deadline: "2026-11-07T10:00:00",
  supplier_id: "sup-1",
  requester_id: USER,
  courier_id: null,
  pickup_location: "COM3",
  delivery_location: "COM1",
  status: "ACCEPTED",
  created_at: "2026-11-06T09:00:00",
};

test.describe("notifications", () => {
  test("header bell shows the unread count badge", async ({ page }) => {
    await seedToken(page);
    await mockApi(page, {
      [`GET ${NLIST}`]: () => ({
        body: { items: [notif()], unread_count: 3, total: 1 },
      }),
    });

    await page.goto("/suppliers");

    await expect(page.locator(INDICATOR)).toHaveText("3");
  });

  test("mark all as read calls read-all and clears the badge", async ({
    page,
  }) => {
    await seedToken(page);
    let marked = false;
    const api = await mockApi(page, {
      [`GET ${NLIST}`]: () => ({
        body: marked
          ? {
              items: [notif({ read_at: "2026-11-06T11:00:00" })],
              unread_count: 0,
              total: 1,
            }
          : { items: [notif()], unread_count: 2, total: 1 },
      }),
      [`POST ${NLIST}/read-all`]: () => {
        marked = true;
        return { body: { marked_read: 2, unread_count: 0 } };
      },
    });

    await page.goto("/notifications");

    await expect(page.locator(INDICATOR)).toHaveText("2");

    await page.getByRole("button", { name: "Mark all as read" }).click();

    await expect
      .poll(() => api.callsTo("POST", `${NLIST}/read-all`).length)
      .toBeGreaterThan(0);
    await expect(page.locator(INDICATOR)).toHaveCount(0);
  });

  test("mark all stays enabled when unread sit on an unloaded page", async ({
    page,
  }) => {
    await seedToken(page);
    await mockApi(page, {
      [`GET ${NLIST}`]: () => ({
        body: {
          items: [notif({ read_at: "2026-11-06T11:00:00" })],
          unread_count: 2,
          total: 20,
        },
      }),
    });

    await page.goto("/notifications");

    await expect(
      page.getByRole("button", { name: "Mark all as read" }),
    ).toBeEnabled();
  });

  test("clicking a notification marks it read and navigates to the order", async ({
    page,
  }) => {
    await seedToken(page);
    const api = await mockApi(page, {
      [`GET ${NLIST}`]: () => ({
        body: { items: [notif()], unread_count: 1, total: 1 },
      }),
      [`POST ${NLIST}/n-1/read`]: () => ({ body: { status: "ok" } }),
      "GET /api/orders/order-1": () => ({ body: ORDER }),
    });

    await page.goto("/notifications");

    await page.getByText("Order accepted").first().click();

    await expect(page).toHaveURL(/\/orders\/order-1$/);
    await expect
      .poll(() => api.callsTo("POST", `${NLIST}/n-1/read`).length)
      .toBeGreaterThan(0);
  });
});
