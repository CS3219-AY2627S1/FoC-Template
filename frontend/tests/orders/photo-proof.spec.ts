// AI-INFLUENCED: Verify required courier photo uploads and participant proof display with Codex.
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
