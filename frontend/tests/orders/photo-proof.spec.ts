// AI-INFLUENCED: Verify photo uploads, participant details, navigation, and the enlarged proof viewer.
// Adapted to the order detail layout from PR #35 (Claude Opus 5.5).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Request } from "@playwright/test";
import { CLIENT_PROFILE, mockApi, seedToken } from "../support/api-mocks";

const PHOTO_FILE = resolve(process.cwd(), "../postman/fixtures/proof.png");
const PHOTO_URI = `data:image/png;base64,${readFileSync(PHOTO_FILE).toString("base64")}`;
const ORDER_ID = "photo-proof-order";
const ORDER_PATH = `/api/orders/${ORDER_ID}`;

const ORDER = {
  order_id: ORDER_ID,
  name: "Deliver lunch",
  details: "One meal",
  reward: 5,
  deadline: "2026-11-10T10:00:00",
  supplier_id: "supplier-1",
  requester_id: "requester-1",
  courier_id: CLIENT_PROFILE.id,
  pickup_location: "COM3",
  delivery_location: "COM1",
  status: "PICKED_UP",
  created_at: "2026-11-09T09:00:00",
};

function assertPhotoUpload(request: Request) {
  expect(request.headers()["content-type"]).toContain("multipart/form-data;");
  const body = request.postDataBuffer();
  expect(body).not.toBeNull();
  expect(body?.includes(Buffer.from('name="photo"; filename="proof.png"'))).toBe(true);
}

test("order details require a photo and show stored proof after delivery", async ({ page }) => {
  await seedToken(page);
  let delivered = false;
  const api = await mockApi(page, {
    [`GET ${ORDER_PATH}`]: () => ({
      body: {
        ...ORDER,
        status: delivered ? "AWAITING_APPROVAL" : "PICKED_UP",
        proof_of_delivery_photo: delivered ? PHOTO_URI : null,
      },
    }),
    [`POST ${ORDER_PATH}/deliver`]: (request) => {
      assertPhotoUpload(request);
      delivered = true;
      return { body: { ...ORDER, status: "AWAITING_APPROVAL" } };
    },
  });

  await page.goto(`/orders/${ORDER_ID}`);
  await page.getByRole("button", { name: "Mark delivered" }).click();
  const modal = page.getByRole("dialog", { name: "Proof of delivery" });
  await expect(modal.getByRole("button", { name: "Mark delivered" })).toBeDisabled();
  await modal.locator('input[type="file"]').setInputFiles(PHOTO_FILE);
  await expect.poll(() => modal.locator('input[type="file"]').evaluate((input: HTMLInputElement) => input.files?.[0]?.size)).toBe(readFileSync(PHOTO_FILE).length);
  await modal.getByRole("button", { name: "Mark delivered" }).click();

  await expect.poll(() => api.callsTo("POST", `${ORDER_PATH}/deliver`).length).toBe(1);
  await expect(page.getByRole("img", { name: "Proof of delivery" })).toBeVisible();
});

test("my deliveries sends the selected photo through the gateway", async ({ page }) => {
  await seedToken(page);
  let delivered = false;
  const api = await mockApi(page, {
    "GET /api/orders/assigned": () => ({ body: delivered ? [] : [ORDER] }),
    [`POST ${ORDER_PATH}/deliver`]: (request) => {
      assertPhotoUpload(request);
      delivered = true;
      return { body: { ...ORDER, status: "AWAITING_APPROVAL" } };
    },
  });

  await page.goto("/deliveries");
  await page.getByRole("button", { name: "Mark delivered" }).click();
  const modal = page.getByRole("dialog", { name: "Proof of delivery" });
  await expect(modal.getByRole("button", { name: "Mark delivered" })).toBeDisabled();
  await modal.locator('input[type="file"]').setInputFiles(PHOTO_FILE);
  await expect.poll(() => modal.locator('input[type="file"]').evaluate((input: HTMLInputElement) => input.files?.[0]?.size)).toBe(readFileSync(PHOTO_FILE).length);
  await modal.getByRole("button", { name: "Mark delivered" }).click();

  await expect.poll(() => api.callsTo("POST", `${ORDER_PATH}/deliver`).length).toBe(1);
  await expect(page.getByText("No active deliveries")).toBeVisible();
});

test("completed delivery card opens order details with names and proof", async ({ page }) => {
  await seedToken(page);
  await mockApi(page, {
    "GET /api/orders/assigned": () => ({ body: [] }),
    "GET /api/orders/assigned/completed": () => ({
      body: [{ ...ORDER, status: "COMPLETED" }],
    }),
    [`GET ${ORDER_PATH}`]: () => ({
      body: {
        ...ORDER,
        status: "COMPLETED",
        supplier_name: "A Hot Hideout",
        requester_name: "Alexander",
        courier_name: "Trial",
        proof_of_delivery_photo: PHOTO_URI,
      },
    }),
  });

  await page.goto("/deliveries");
  await page.getByRole("tab", { name: "Completed" }).click();
  await page.getByText("Deliver lunch").click();

  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_ID}$`));
  await expect(page.getByText("A Hot Hideout")).toBeVisible();
  await expect(page.getByText("Alexander")).toBeVisible();
  await expect(page.getByText("Delivery photo submitted by you")).toBeVisible();
  await expect(page.getByRole("img", { name: "Proof of delivery" })).toBeVisible();
  await page.getByRole("button", { name: "View full photo" }).click();
  await expect(page.getByRole("dialog", { name: "Proof of delivery" })
    .getByRole("img", { name: "Full-size proof of delivery" })).toBeVisible();
});

test("completed request card opens order details with names and proof", async ({ page }) => {
  await seedToken(page);
  await mockApi(page, {
    "GET /api/users/me": () => ({ body: { ...CLIENT_PROFILE, id: ORDER.requester_id } }),
    "GET /api/orders/requested/ongoing": () => ({ body: [] }),
    "GET /api/orders/requested/completed": () => ({
      body: [{ ...ORDER, status: "COMPLETED" }],
    }),
    [`GET ${ORDER_PATH}`]: () => ({
      body: {
        ...ORDER,
        status: "COMPLETED",
        supplier_name: "A Hot Hideout",
        requester_name: "Alexander",
        courier_name: "Trial",
        proof_of_delivery_photo: PHOTO_URI,
      },
    }),
  });

  await page.goto("/orders/mine");
  await page.getByRole("tab", { name: "Completed" }).click();
  await page.getByText("Deliver lunch").click();

  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_ID}$`));
  await expect(page.getByText("A Hot Hideout")).toBeVisible();
  await expect(page.getByText("Trial", { exact: true })).toBeVisible();
  await expect(page.getByText("Delivery photo submitted by Trial")).toBeVisible();
  await expect(page.getByRole("img", { name: "Proof of delivery" })).toBeVisible();
});

test("request action button does not open order details", async ({ page }) => {
  await seedToken(page);
  await mockApi(page, {
    "GET /api/users/me": () => ({ body: { ...CLIENT_PROFILE, id: ORDER.requester_id } }),
    "GET /api/orders/requested/ongoing": () => ({
      body: [{ ...ORDER, status: "OPEN", courier_id: null }],
    }),
  });

  await page.goto("/orders/mine");
  await page.getByRole("button", { name: "Edit" }).click();

  await expect(page).toHaveURL(/\/orders\/mine$/);
  await expect(page.getByRole("dialog", { name: "Edit Order" })).toBeVisible();
});
