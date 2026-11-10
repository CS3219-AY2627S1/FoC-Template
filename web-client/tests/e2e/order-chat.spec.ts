import { expect, test, type Page } from "@playwright/test";
import type { OrderDetail, OrderParticipant } from "../../src/api/order-service";
import { ChatFixture } from "./chat-fixture";

const orderId = "550e8400-e29b-41d4-a716-446655440001";
const assigned: OrderParticipant = {
  orderId, supplierId: "supplier", itemDescription: "One vegetarian sandwich", deliveryLocation: "COM3",
  reward: 1, acceptanceDeadline: "2035-01-01T04:00:00Z", deliveryDeadline: "2035-01-01T05:00:00Z",
  state: "ACCEPTED", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T01:00:00Z",
  requesterId: "alice", courierId: "bob",
  pickup: { name: "A Hot Hideout", buildingArea: "Prince George's Park", floor: "2", pickupLocationDescription: "Near PGP entrance", latitude: null, longitude: null, updatedAt: "2026-10-21T00:00:00Z" },
};

async function installOrder(page: Page, fixture: ChatFixture, me = "alice", detail: OrderDetail = assigned) {
  await fixture.install(page, me);
  await page.route((url) => url.pathname === `/v1/orders/${orderId}`, (route) => route.fulfill({ json: detail }));
  await page.route((url) => url.pathname === `/v1/orders/${orderId}/history`, (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } }));
}

for (const role of ["requester", "courier"] as const) {
  for (const width of [320, 511, 1440]) {
    test(`${role} opens the other participant's existing chat at ${width}px`, async ({ page }, testInfo) => {
      const fixture = new ChatFixture(); fixture.message("bob", "Existing conversation history");
      const me = role === "requester" ? "alice" : "bob", recipient = role === "requester" ? "bob" : "alice";
      await page.setViewportSize({ width, height: 713 }); await installOrder(page, fixture, me);
      const recipients: string[] = [];
      await page.route((url) => url.pathname === "/v1/chat/conversations", async (route) => {
        if (route.request().method() === "POST") {
          recipients.push(route.request().postDataJSON().recipientUserId);
          expect(route.request().headers().authorization).toBe(`Bearer ${me}-test-token`);
        }
        await route.fallback();
      });
      await page.goto(`/orders/${orderId}`);
      const button = page.getByRole("button", { name: `Message ${role === "requester" ? "courier" : "requester"}`, exact: true });
      await expect(button).toBeVisible();
      const titleBox = (await page.getByRole("heading", { name: assigned.itemDescription }).boundingBox())!;
      const buttonBox = (await button.boundingBox())!;
      expect(buttonBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
      expect(Math.abs(buttonBox.y - titleBox.y)).toBeLessThan(12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`order-chat-${role}-${width}.png`), fullPage: true });
      await button.focus(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/messages\/ab$/);
      await expect(page.getByRole("list", { name: "Messages", exact: true })).toContainText("Existing conversation history");
      expect(recipients).toEqual([recipient]); expect(fixture.sends).toHaveLength(0);
      await page.goto(`/orders/${orderId}`); await button.click();
      await expect(page).toHaveURL(/\/messages\/ab$/);
      expect(recipients).toEqual([recipient, recipient]);
    });
  }
}

test("first contact creates the pair's conversation from the errand", async ({ page }) => {
  const fixture = new ChatFixture(); fixture.openPair = false;
  await installOrder(page, fixture); await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Message courier", exact: true }).click();
  await expect(page).toHaveURL(/\/messages\/ab$/);
  await expect(page.getByText("No messages yet. Say hello.", { exact: true })).toBeVisible();
  expect(fixture.openPair).toBe(true); expect(fixture.sends).toHaveLength(0);
});

for (const scenario of ["unassigned", "assessment", "outsider"] as const) {
  test(`${scenario} order detail does not expose a message action`, async ({ page }) => {
    const fixture = new ChatFixture();
    const detail = scenario === "unassigned" ? { ...assigned, state: "OPEN" as const, courierId: null }
      : scenario === "outsider" ? { ...assigned, requesterId: "someone-else", courierId: "another-user" }
        : Object.fromEntries(Object.entries(assigned).filter(([key]) => !["requesterId", "courierId"].includes(key))) as OrderDetail;
    await installOrder(page, fixture, "alice", detail); await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: assigned.itemDescription })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Message (courier|requester)$/ })).toHaveCount(0);
  });
}

test("a pending open blocks duplicate clicks", async ({ page }) => {
  const fixture = new ChatFixture(); await installOrder(page, fixture);
  let calls = 0, release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname === "/v1/chat/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    calls++; await pending; await route.fulfill({ json: { conversationId: "ab" } });
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Message courier", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("button", { name: "Opening conversation…", exact: true })).toBeDisabled();
  expect(calls).toBe(1); release(); await expect(page).toHaveURL(/\/messages\/ab$/);
});

for (const failure of [
  { status: 503, code: "SERVICE_NOT_READY", message: "Dependency unavailable" },
  { status: 409, code: "MESSAGING_BLOCKED", message: "Messaging is blocked for this pair." },
  { status: 409, code: "RECIPIENT_UNAVAILABLE", message: "Messaging is unavailable for this user." },
]) {
  test(`${failure.code} stays on the errand and allows an explicit retry`, async ({ page }) => {
    const fixture = new ChatFixture(); await installOrder(page, fixture);
    let calls = 0;
    await page.route((url) => url.pathname === "/v1/chat/conversations", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      calls++;
      if (calls === 1) return route.fulfill({ status: failure.status, json: { error: { code: failure.code, message: failure.message, fieldErrors: [], correlationId: "test" } } });
      return route.fulfill({ json: { conversationId: "ab" } });
    });
    await page.goto(`/orders/${orderId}`);
    await page.getByRole("button", { name: "Message courier", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(failure.status === 503 ? "Messages are temporarily unavailable" : failure.message);
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByRole("button", { name: "Message courier", exact: true })).toBeEnabled();
    expect(calls).toBe(1);
    await page.getByRole("button", { name: "Message courier", exact: true }).click();
    await expect(page).toHaveURL(/\/messages\/ab$/); expect(calls).toBe(2);
  });
}
