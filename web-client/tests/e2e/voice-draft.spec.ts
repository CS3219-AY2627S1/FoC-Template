/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated and refined Voice Assist client, form or recording regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { expect, test, type Page } from "@playwright/test";

// Chromium's fake microphone produces real audio, so MediaRecorder runs for real here.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone"],
});

const supplierId = "550e8400-e29b-41d4-a716-446655440000";
const orderId = "550e8400-e29b-41d4-a716-446655440001";
const status = { available: true, provider: "OpenAI", maxRecordingSeconds: 60, processingTimeoutSeconds: 30, retentionNotice: "Your audio is sent to OpenAI to draft your errand." };

function draft(requestId: string) {
  return {
    requestId, generatedAt: "2035-01-01T03:00:00Z", timeZone: "Asia/Singapore", outcome: "DRAFT",
    transcript: "Get me one vegetarian sandwich from Cool Spot, deliver to COM3 level 1 by 1pm, 10 credits",
    fields: {
      itemDescription: { value: "one vegetarian sandwich", status: "FILLED", note: null },
      deliveryLocation: { value: "COM3 level 1", status: "FILLED", note: null },
      reward: { value: 10, status: "FILLED", note: null },
      acceptanceDeadline: { value: null, status: "MISSING", note: "Enter the latest acceptance time. A delivery time is not used for it." },
      deliveryDeadline: { value: "2035-01-01T05:00:00Z", status: "FILLED", note: null, display: "Mon 01 Jan, 1:00 PM SGT" },
      supplier: {
        value: supplierId, status: "FILLED", note: "Suggested from your recording. Change it if needed.",
        suggestion: { id: supplierId, name: "Cool Spot", buildingArea: "COM2", floor: "1", pickupLocationDescription: "Collect at the counter" },
        candidates: [],
      },
    },
  };
}

async function mockSession(page: Page) {
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: { accessToken: "test-token", tokenType: "Bearer", expiresAt: "2035-01-01T00:00:00Z" } }));
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: { userId: "user-id", username: "student", email: "student@u.nus.edu", displayName: "Jihun Hwang", systemRole: "USER", accountStatus: "ACTIVE" } }));
  await page.route(`**/api/v1/suppliers/${supplierId}`, (route) => route.fulfill({ json: { id: supplierId, name: "Cool Spot", building_area: "COM2", status: "ACTIVE" } }));
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => route.fulfill({ json: { items: [{ id: supplierId, name: "Cool Spot", building_area: "COM2", floor: "1", categories: ["FOOD"], status: "ACTIVE", opening_time: null, closing_time: null }], page: 1, page_size: 20, total: 1 } }));
}

async function mockVoiceAssist(page: Page, onDraft: (route: Parameters<Parameters<Page["route"]>[1]>[0]) => Promise<void> | void) {
  await page.route("**/v1/voice-assist/status", (route) => route.fulfill({ json: status }));
  await page.route("**/v1/voice-assist/errand-drafts", onDraft);
}

async function recordBriefly(page: Page) {
  const start = page.getByRole("button", { name: "Start recording" });
  await start.focus();
  await page.keyboard.press("Enter");
  // The first fake-microphone start in a fresh browser can be slow.
  await expect(page.getByRole("status").filter({ hasText: "Recording:" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Stop and generate draft" }).press("Enter");
}

for (const width of [375, 1440]) {
  test(`voice draft fills the form, the requester completes it and posts (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockSession(page);
    const uploads: { contentType: string; size: number }[] = [];
    await mockVoiceAssist(page, (route) => {
      const request = route.request();
      uploads.push({ contentType: request.headers()["content-type"], size: request.postDataBuffer()?.length ?? 0 });
      return route.fulfill({ json: draft(request.headers()["x-client-request-id"]) });
    });
    const posted: unknown[] = [];
    await page.route((url) => url.pathname === "/v1/orders", (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ json: { items: [], page: 1, pageSize: 12, total: 0 } });
      posted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: {
        orderId, supplierId, itemDescription: "one vegetarian sandwich", deliveryLocation: "COM3 level 1", reward: 10,
        acceptanceDeadline: "2035-01-01T04:00:00Z", deliveryDeadline: "2035-01-01T05:00:00Z", state: "OPEN", createdAt: "2035-01-01T03:00:00Z",
        requesterId: "user-id", courierId: null, updatedAt: "2035-01-01T03:00:00Z",
        pickup: { name: "Cool Spot", buildingArea: "COM2", pickupLocationDescription: "Collect at the counter", floor: "1", latitude: null, longitude: null, updatedAt: "2035-01-01T03:00:00Z" },
      } });
    });

    await page.goto("/orders/new");
    await expect(page.getByText(status.retentionNotice)).toBeVisible();
    await recordBriefly(page);
    await expect(page.getByText("Draft ready.")).toBeVisible();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].contentType).toMatch(/^audio\/(webm|ogg|mp4)/);
    expect(uploads[0].size).toBeGreaterThan(0);

    await expect(page.getByLabel("Instructions")).toHaveValue("one vegetarian sandwich");
    await expect(page.getByLabel("Latest delivery time (SGT)")).toHaveValue("2035-01-01T13:00");
    await expect(page.getByText("Enter the latest acceptance time. A delivery time is not used for it.")).toBeVisible();
    await page.getByText("What we heard").click();
    await expect(page.getByText(/vegetarian sandwich from Cool Spot/)).toBeVisible();
    expect(posted).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByLabel("Latest acceptance time (SGT)").fill("2035-01-01T12:00");
    await page.getByRole("button", { name: "Post errand" }).click();
    await expect(page.getByRole("heading", { name: "Your errand is open" })).toBeVisible();
    expect(posted).toEqual([{
      supplierId, itemDescription: "one vegetarian sandwich", deliveryLocation: "COM3 level 1", reward: 10,
      acceptanceDeadline: "2035-01-01T04:00:00.000Z", deliveryDeadline: "2035-01-01T05:00:00.000Z",
    }]);
  });
}

test("a slow draft times out after 30 seconds and the form stays usable", async ({ page }) => {
  await page.clock.install();
  await mockSession(page);
  await mockVoiceAssist(page, () => new Promise(() => {}));
  await page.goto("/orders/new");
  await page.getByLabel("Delivery location").fill("UTown");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("button", { name: "Replace and record" }).click();
  await expect(page.getByRole("button", { name: "Stop and generate draft" })).toBeVisible();
  await page.getByRole("button", { name: "Stop and generate draft" }).click();
  await expect(page.getByText("Generating your draft…")).toBeVisible();
  await page.clock.fastForward("00:31");
  await expect(page.getByRole("alert")).toContainText("Drafting took too long.");
  await expect(page.getByLabel("Delivery location")).toHaveValue("UTown");
});

test("a denied microphone explains itself and leaves the manual form", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await mockSession(page);
  await mockVoiceAssist(page, () => { throw new Error("no upload expected"); });
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("alert")).toContainText("Microphone access was denied.");
  await page.getByRole("button", { name: "Fill in the form myself" }).click();
  await expect(page.getByRole("combobox", { name: "Pickup supplier" })).toBeFocused();
});

test("the ordinary form works when Voice Assist is down", async ({ page }) => {
  await mockSession(page);
  await page.route("**/v1/voice-assist/**", (route) => route.fulfill({ status: 502, body: "Bad Gateway" }));
  await page.goto("/orders/new");
  await expect(page.getByText("Voice drafting is unavailable right now. Fill in the form below.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
  await page.getByLabel("Delivery location").fill("COM3 level 1");
  await expect(page.getByLabel("Delivery location")).toHaveValue("COM3 level 1");
});
