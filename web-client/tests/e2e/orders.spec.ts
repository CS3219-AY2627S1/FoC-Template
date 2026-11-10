// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-10, 2026-10-11
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented browser coverage for participant Order creation and lifecycle actions.
// Author review: I validated correctness and added boundary checks where needed.

import { expect, test, type Page } from "@playwright/test";

const supplierId = "550e8400-e29b-41d4-a716-446655440000";
const orderId = "550e8400-e29b-41d4-a716-446655440001";
const operationId = "550e8400-e29b-41d4-a716-446655440002";
const order = {
  orderId, supplierId, itemDescription: "One vegetarian sandwich", deliveryLocation: "COM3 level 1 collection point", reward: 10,
  acceptanceDeadline: "2035-01-01T04:00:00Z", deliveryDeadline: "2035-01-01T05:00:00Z", state: "OPEN", createdAt: "2026-10-09T12:00:00Z",
  pickup: { name: "Cool Spot", buildingArea: "COM2", pickupLocationDescription: "Collect at the counter", floor: "1", latitude: null, longitude: null, updatedAt: "2026-10-09T12:00:00Z" },
};
const participant = { ...order, requesterId: "user-id", courierId: null, updatedAt: order.createdAt };
const list = (items: unknown[], page = 1, pageSize = 12, total = items.length) => ({ items, page, pageSize, total });
const pending = { operationId, stage: "RESERVATION_UNKNOWN", orderId: null, statusUrl: `/v1/order-creations/${operationId}`, retryCreation: false, errorCode: "CREDIT_UNAVAILABLE" };

test("requester confirms cancellation, prevents double submit and refreshes history", async ({ page }) => {
  await mockSession(page);
  let cancelled = false;
  let calls = 0;
  await page.route(`**/v1/orders/${orderId}/cancel`, async (route) => {
    calls++;
    expect(route.request().postData()).toBeNull();
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    await new Promise((resolve) => setTimeout(resolve, 100));
    cancelled = true;
    await route.fulfill({ json: { ...participant, state: "CANCELLED" } });
  });
  await page.route(`**/v1/orders/${orderId}/history*`, (route) => route.fulfill({ json: list([
    { sequence: 1, newState: cancelled ? "CANCELLED" : "OPEN", actorType: "USER", actorId: "user-id", occurredAt: order.createdAt },
  ]) }));
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("button", { name: "Accept errand", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel errand", exact: true }).click();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Keep errand" }).click();
  await expect(page.getByRole("button", { name: "Confirm cancellation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel errand", exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText("Errand cancelled. Your reserved credits will be returned.")).toBeVisible();
  await expect(page.locator(".order-history")).toContainText("CANCELLED");
  expect(calls).toBe(1);
});

test("acceptance turns assessment into participant detail and fetches private history", async ({ page }, testInfo) => {
  await mockSession(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: order }));
  await page.route(`**/v1/orders/${orderId}/accept`, (route) => route.fulfill({ json: { ...participant, requesterId: "someone-else", courierId: "user-id", state: "ACCEPTED" } }));
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "Errand history" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel errand", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("accept-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Accept errand", exact: true }).click();
  await expect(page.getByText("You accepted this errand.")).toBeVisible();
  await expect(page.getByText("You are the courier.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Errand history" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept errand", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("lost acceptance response allows the same action retry without duplicate clicks", async ({ page }) => {
  await mockSession(page);
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: order }));
  const requests: string[] = [];
  await page.route(`**/v1/orders/${orderId}/accept`, async (route) => {
    requests.push(route.request().url());
    if (requests.length === 1) { await new Promise((resolve) => setTimeout(resolve, 100)); await route.abort(); }
    else await route.fulfill({ json: { ...participant, requesterId: "other", courierId: "user-id", state: "ACCEPTED" } });
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Accept errand", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("alert")).toContainText("could not confirm");
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("You accepted this errand.")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
});

test("competing acceptance reports conflict and refresh removes unavailable details", async ({ page }) => {
  await mockSession(page);
  let lostRace = false;
  await page.route(`**/v1/orders/${orderId}`, (route) => lostRace ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: order }));
  await page.route(`**/v1/orders/${orderId}/accept`, (route) => {
    lostRace = true;
    return route.fulfill({ status: 409, json: { error: { code: "ORDER_NOT_OPEN", message: "This errand is no longer open." } } });
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Accept errand", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("no longer open");
  await expect(page.getByText("You accepted this errand.")).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh errand" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable or you do not have access");
  await expect(page.getByRole("button", { name: "Accept errand", exact: true })).toHaveCount(0);
});

test("deadline passes while page is open and expiry history is a system action", async ({ page }) => {
  await mockSession(page);
  await page.clock.install({ time: new Date("2035-01-01T03:59:59Z") });
  let expired = false;
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: { ...participant, state: expired ? "EXPIRED" : "OPEN" } }));
  await page.route(`**/v1/orders/${orderId}/history*`, (route) => route.fulfill({ json: list([{ sequence: 2, newState: "EXPIRED", actorType: "SYSTEM", actorId: null, occurredAt: order.acceptanceDeadline }]) }));
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("button", { name: "Cancel errand", exact: true })).toBeVisible();
  await page.clock.runFor(1100);
  await expect(page.getByText("The acceptance deadline has passed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel errand", exact: true })).toHaveCount(0);
  expired = true;
  await page.getByRole("button", { name: "Refresh errand" }).click();
  await expect(page.getByText("Updated automatically")).toBeVisible();
  await expect(page.locator(".order-heading")).toContainText("EXPIRED");
});

for (const state of ["ACCEPTED", "CANCELLED", "EXPIRED"]) {
  test(`${state} detail never offers accept/cancel`, async ({ page }) => {
    await mockSession(page);
    await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: { ...participant, state } }));
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole("region", { name: "Errand actions" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Accept|Cancel) errand$/ })).toHaveCount(0);
  });
}

test("courier records pickup and delivery, then waits for requester confirmation", async ({ page }, testInfo) => {
  await mockSession(page);
  const assigned = { ...participant, requesterId: "other", courierId: "user-id", state: "ACCEPTED" };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: assigned }));
  let pickupCalls = 0;
  await page.route(`**/v1/orders/${orderId}/pickup`, async (route) => {
    pickupCalls++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return route.fulfill({ json: { ...assigned, state: "PICKED_UP" } });
  });
  await page.route(`**/v1/orders/${orderId}/deliver`, (route) => route.fulfill({ json: { ...assigned, state: "DELIVERED", overdueAt: order.deliveryDeadline } }));
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("button", { name: "Mark delivered", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark picked up", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByText("Pickup recorded.")).toBeVisible();
  expect(pickupCalls).toBe(1);
  await page.getByRole("button", { name: "Mark delivered", exact: true }).click();
  await expect(page.getByText("Delivery recorded.", { exact: false })).toBeVisible();
  await expect(page.getByText("Delivered late since", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm received", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("fulfilment-delivered.png"), fullPage: true });
});

test("requester confirms receipt and completion does not claim payment", async ({ page }, testInfo) => {
  await mockSession(page);
  await page.setViewportSize({ width: 375, height: 900 });
  const delivered = { ...participant, courierId: "courier", state: "DELIVERED" };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: delivered }));
  let count = 0;
  await page.route(`**/v1/orders/${orderId}/complete`, (route) => {
    count++;
    return route.fulfill({ json: { ...delivered, state: "COMPLETED" } });
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Confirm received", exact: true }).click();
  expect(count).toBe(0);
  await page.getByRole("button", { name: "Not yet", exact: true }).click();
  await page.getByRole("button", { name: "Confirm received", exact: true }).click();
  await page.getByRole("button", { name: "Complete errand", exact: true }).click();
  await expect(page.getByRole("region", { name: "Errand actions" })).toContainText("payment is not confirmed yet");
  await expect(page.getByRole("button", { name: "Confirm received", exact: true })).toHaveCount(0);
  expect(count).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("completion-mobile.png"), fullPage: true });
});

test("ambiguous completion safely retries the same action", async ({ page }) => {
  await mockSession(page);
  const delivered = { ...participant, state: "DELIVERED", courierId: "courier" };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: delivered }));
  let count = 0;
  await page.route(`**/v1/orders/${orderId}/complete`, (route) => ++count === 1 ? route.abort() : route.fulfill({ json: { ...delivered, state: "COMPLETED" } }));
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Confirm received", exact: true }).click();
  await page.getByRole("button", { name: "Complete errand", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not confirm");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("region", { name: "Errand actions" })).toContainText("Errand completed.");
  expect(count).toBe(2);
});

test("overdue courier can still record delivery and requester cannot", async ({ page }) => {
  await mockSession(page);
  const late = { ...participant, requesterId: "other", courierId: "user-id", state: "PICKED_UP", overdueAt: "2026-01-01T00:00:00Z" };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: late }));
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Delivery overdue since", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark delivered", exact: true })).toBeEnabled();
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: { ...late, requesterId: "user-id", courierId: "other" } }));
  await page.getByRole("button", { name: "Refresh errand" }).click();
  await expect(page.getByText("Waiting for the assigned courier", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark delivered", exact: true })).toHaveCount(0);
});

async function mockSession(page: Page) {
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: { accessToken: "test-token", tokenType: "Bearer", expiresAt: "2035-01-01T00:00:00Z" } }));
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: { userId: "user-id", username: "student", email: "student@u.nus.edu", displayName: "Jihun Hwang", systemRole: "USER", accountStatus: "ACTIVE" } }));
  await page.route(`**/api/v1/suppliers/${supplierId}`, (route) => route.fulfill({ json: { id: supplierId, name: "Cool Spot", building_area: "COM2", status: "ACTIVE" } }));
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => route.fulfill({ json: { items: [{ id: supplierId, name: "Cool Spot", building_area: "COM2", floor: "1", categories: ["FOOD"], status: "ACTIVE", opening_time: null, closing_time: null }], page: 1, page_size: 20, total: 1 } }));
  await page.route((url) => url.pathname === "/v1/orders", (route) => route.fulfill({ json: list([order]) }));
  await page.route((url) => url.pathname === "/v1/orders/mine", (route) => route.fulfill({ json: list([participant]) }));
  await page.route((url) => url.pathname === `/v1/orders/${orderId}`, (route) => route.fulfill({ json: participant }));
  await page.route((url) => url.pathname === `/v1/orders/${orderId}/history`, (route) => route.fulfill({ json: list([{ sequence: 1, previousState: null, newState: "OPEN", actorId: "user-id", actorType: "USER", occurredAt: order.createdAt }], 1, 20) }));
}

const disputeId = "550e8400-e29b-41d4-a716-446655440009";
const dispute = (status: string, extra: Record<string, unknown> = {}) => ({
  disputeId, orderId, ownReport: true, reporterRole: "REQUESTER", problem: "ITEM_DAMAGED", problemDetails: null,
  status, resolutionReason: null, statements: [], createdAt: order.createdAt, updatedAt: order.createdAt, version: 1, ...extra,
});

for (const courier of [false, true]) {
  test(`${courier ? "courier" : "requester"} reports a problem and the errand pauses for review`, async ({ page }, testInfo) => {
    await mockSession(page);
    await page.setViewportSize({ width: courier ? 1440 : 375, height: 900 });
    const active = { ...participant, state: "PICKED_UP", requesterId: courier ? "other" : "user-id", courierId: courier ? "user-id" : "other" };
    let reported = false;
    const held = { ...active, state: "DISPUTED", disputeId, disputedFromState: "PICKED_UP", disputedAt: order.createdAt };
    await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: reported ? held : active }));
    const bodies: unknown[] = [];
    await page.route((url) => url.pathname === "/v1/disputes", async (route) => {
      if (route.request().method() === "POST") {
        bodies.push(route.request().postDataJSON());
        expect(route.request().headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
        await new Promise((resolve) => setTimeout(resolve, 100));
        reported = true;
        return route.fulfill({ status: 201, json: dispute("OPEN", { problem: "OTHER", problemDetails: "Package broken", reporterRole: courier ? "COURIER" : "REQUESTER" }) });
      }
      return route.fulfill({ json: list(reported ? [dispute("OPEN", { problem: "OTHER", problemDetails: "Package broken" })] : [], 1, 50) });
    });
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole("button", { name: "Mark failed", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Report problem", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "What went wrong", exact: true }).selectOption("OTHER");
    await expect(page.getByRole("button", { name: "Report problem", exact: true })).toBeDisabled();
    await page.getByRole("textbox", { name: "Describe the problem", exact: false }).fill("Package broken");
    await page.screenshot({ path: testInfo.outputPath("report-problem.png"), fullPage: true });
    await page.getByRole("button", { name: "Report problem", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.locator(".order-heading")).toContainText("DISPUTED");
    await expect(page.getByText("This errand is on hold while an administrator reviews a reported problem.", { exact: false })).toBeVisible();
    await expect(page.getByText("continues from picked up", { exact: false })).toBeVisible();
    await expect(page.getByText("Other: Package broken")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark delivered", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Details for the administrator", exact: true })).toBeVisible();
    expect(bodies).toEqual([{ orderId, problem: "OTHER", problemDetails: "Package broken" }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("the other participant sees the reported problem and sends private details while the errand is held", async ({ page }) => {
  await mockSession(page);
  const held = { ...participant, state: "DISPUTED", requesterId: "other", courierId: "user-id", disputeId, disputedFromState: "DELIVERED", disputedAt: order.createdAt };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: held }));
  let sent: unknown = null;
  await page.route((url) => url.pathname === "/v1/disputes", (route) => route.fulfill({ json: list([
    dispute("UNDER_REVIEW", { ownReport: false, statements: sent ? [{ statementId: "s1", body: "I left it at the counter.", createdAt: order.createdAt }] : [] }),
  ], 1, 50) }));
  await page.route(`**/v1/disputes/${disputeId}/statements`, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: dispute("UNDER_REVIEW", { ownReport: false, statements: [{ statementId: "s1", body: "I left it at the counter.", createdAt: order.createdAt }] }) });
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("The requester reported a problem", { exact: false })).toBeVisible();
  await expect(page.locator("#errand-report-heading + ol")).toContainText("Problem: Item damaged");
  await expect(page.getByRole("button", { name: "Withdraw report", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Report problem", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Details for the administrator", exact: true }).fill("I left it at the counter.");
  await page.getByRole("button", { name: "Send details", exact: true }).click();
  await expect(page.getByText("Your details to the administrator")).toBeVisible();
  expect(sent).toEqual({ body: "I left it at the counter." });
});

test("an accepted dispute shows the reporter's problem as the failure reason and keeps the overdue note", async ({ page }) => {
  await mockSession(page);
  const failed = {
    ...participant, state: "FAILED", courierId: "other", overdueAt: order.deliveryDeadline, failedAt: order.createdAt,
    failureReason: "ITEM_DAMAGED", failureDetails: null, decidedByAdministrator: true, decisionDisputeId: disputeId,
  };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: failed }));
  await page.route((url) => url.pathname === "/v1/disputes", (route) => route.fulfill({ json: list([
    dispute("ACCEPTED", { resolutionReason: "Photos show the damage." }),
  ], 1, 50) }));
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Failure reason: Item damaged.")).toBeVisible();
  await expect(page.getByText("An administrator accepted the reported problem", { exact: false })).toBeVisible();
  await expect(page.getByText("Was overdue since", { exact: false })).toBeVisible();
  await expect(page.getByText("Photos show the damage.")).toBeVisible();
  await expect(page.getByText("The errand was marked as failed, so the reward returns to the requester.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Report problem", exact: true })).toHaveCount(0);
});

test("the reporter withdraws an open report and the errand continues", async ({ page }) => {
  await mockSession(page);
  let withdrawn = false;
  const active = { ...participant, state: "ACCEPTED", courierId: "other" };
  const held = { ...active, state: "DISPUTED", disputeId, disputedFromState: "ACCEPTED", disputedAt: order.createdAt };
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: withdrawn ? active : held }));
  await page.route((url) => url.pathname === "/v1/disputes", (route) => route.fulfill({ json: list([
    withdrawn ? dispute("WITHDRAWN", { resolutionReason: "Courier found the shop open.", version: 2 }) : dispute("OPEN"),
  ], 1, 50) }));
  await page.route(`**/v1/disputes/${disputeId}/withdraw`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ reason: "Courier found the shop open.", expectedVersion: 1 });
    withdrawn = true;
    return route.fulfill({ json: dispute("WITHDRAWN", { resolutionReason: "Courier found the shop open.", version: 2 }) });
  });
  await page.goto(`/orders/${orderId}`);
  await page.getByRole("button", { name: "Withdraw report", exact: true }).click();
  await page.getByRole("textbox", { name: "Why are you withdrawing?", exact: false }).fill("Courier found the shop open.");
  await page.getByRole("button", { name: "Withdraw and continue the errand", exact: true }).click();
  await expect(page.locator(".order-heading")).toContainText("ACCEPTED");
  await expect(page.getByText("Withdrawal reason:")).toBeVisible();
  await expect(page.getByText("Waiting for the assigned courier to update the errand.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "What went wrong", exact: true })).toBeVisible();
});

async function fillForm(page: Page) {
  await page.getByRole("combobox", { name: "Pickup supplier", exact: true }).click();
  await page.getByRole("option", { name: "Cool Spot COM2", exact: true }).click();
  await page.getByLabel("Delivery location", { exact: true }).fill(order.deliveryLocation);
  await page.getByLabel("Latest acceptance time (SGT)").fill("2035-01-01T12:00");
  await page.getByLabel("Latest delivery time (SGT)").fill("2035-01-01T13:00");
  await page.getByLabel("Instructions", { exact: true }).fill(order.itemDescription);
  await page.getByLabel("Credit reward", { exact: true }).fill("10");
}

for (const width of [375, 768, 1024, 1440]) {
  test(`Order create/browse/detail match shared responsive shell at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockSession(page);
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Open errands" })).toBeVisible();
    await expect(page.locator(".workspace-topbar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`order-browse-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: /View errand/ }).click();
    await expect(page.getByRole("heading", { name: "Errand history" })).toBeVisible();
    await expect(page.getByText("Updated by a participant")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`order-detail-${width}.png`), fullPage: true });
    await page.goto("/orders/new");
    await fillForm(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`order-create-${width}.png`), fullPage: true });
    await page.getByRole("combobox", { name: "Pickup supplier" }).click();
    await expect(page.getByRole("option", { name: "Cool Spot COM2" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`order-picker-${width}.png`), fullPage: true });
  });
}

test("creation distinguishes Credit unavailable from success and replays the saved request", async ({ page }) => {
  await mockSession(page);
  const calls: { body: string | null; key: string | undefined }[] = [];
  await page.route((url) => url.pathname === "/v1/orders", (route) => {
    calls.push({ body: route.request().postData(), key: route.request().headers()["idempotency-key"] });
    return calls.length === 1 ? route.fulfill({ status: 503, json: { error: { code: "CREDIT_UNAVAILABLE", message: "Credit is not configured.", fieldErrors: [] } } }) : route.fulfill({ status: 201, json: participant });
  });
  await page.goto("/orders/new"); await fillForm(page);
  await page.getByRole("button", { name: "Post errand", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We could not check your credits.");
  await expect(page.getByRole("alert")).not.toContainText("configured");
  await expect(page.getByRole("heading", { name: "Your errand is open" })).toHaveCount(0);
  await expect(page.getByLabel("Instructions", { exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Your errand is open" })).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0].key).toBeTruthy();
  expect(JSON.parse(calls[0].body!).acceptanceDeadline).toBe("2035-01-01T04:00:00.000Z");
});

test("202 is pending, requires fresh authenticated retry, and closed attempts allow a new request", async ({ page }) => {
  await mockSession(page);
  let count = 0;
  await page.route((url) => url.pathname === "/v1/orders", (route) => route.fulfill({ status: 202, json: ++count === 1 ? pending : { ...pending, stage: "ABORTED", retryCreation: false } }));
  await page.route(`**/v1/order-creations/${operationId}`, (route) => route.fulfill({ json: { ...pending, stage: "READY_TO_FINALIZE", retryCreation: true } }));
  await page.goto("/orders/new"); await fillForm(page);
  await page.getByRole("button", { name: "Post errand", exact: true }).click();
  await expect(page.getByRole("region", { name: "Creation progress" })).toContainText("Checking your errand");
  await expect(page.getByRole("region", { name: "Creation progress" })).not.toContainText("RESERVATION UNKNOWN");
  await expect(page.getByRole("region", { name: "Creation progress" })).not.toContainText("CREDIT_UNAVAILABLE");
  await expect(page.getByRole("button", { name: "Try again" })).toBeDisabled();
  await page.getByRole("button", { name: "Check status" }).click();
  await page.getByRole("button", { name: "Finish posting errand" }).click();
  await expect(page.getByRole("heading", { name: "Your errand was not posted" })).toBeVisible();
  await page.getByRole("button", { name: "Start a new request" }).click();
  await expect(page.getByLabel("Instructions", { exact: true })).toBeEnabled();
});

test("assessment detail does not request private history", async ({ page }) => {
  await mockSession(page);
  let historyCalls = 0;
  await page.route(`**/v1/orders/${orderId}`, (route) => route.fulfill({ json: order }));
  await page.route(`**/v1/orders/${orderId}/history*`, (route) => { historyCalls++; return route.fulfill({ status: 404, json: {} }); });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "About this errand" })).toHaveCount(0);
  await expect(page.getByText(orderId, { exact: true })).toHaveCount(0);
  expect(historyCalls).toBe(0);
  await expect(page.getByRole("heading", { name: "Errand history" })).toHaveCount(0);
});

test("own-order relationship and pagination are sent to the service", async ({ page }) => {
  await mockSession(page);
  const queries: string[] = [];
  await page.route((url) => url.pathname === "/v1/orders/mine", (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params.toString());
    return route.fulfill({ json: list([participant], Number(params.get("page")), 12, 13) });
  });
  await page.goto("/orders/mine");
  await page.getByRole("button", { name: "As courier" }).click();
  await expect(page.getByRole("button", { name: "As courier" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: order.itemDescription })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  expect(queries.at(-1)).toContain("relationship=courier");
  expect(queries.at(-1)).toContain("page=2");
});

test("input errors are announced and never send a creation", async ({ page }) => {
  await mockSession(page);
  let posted = false;
  await page.route((url) => url.pathname === "/v1/orders", (route) => { posted = true; return route.fulfill({ json: participant }); });
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Post errand", exact: true }).click();
  await expect(page.getByText("Check the highlighted fields before posting.")).toBeVisible();
  await expect(page.getByLabel("Credit reward", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(posted).toBe(false);
});

test("empty lists and dependency failures offer honest recovery", async ({ page }) => {
  await mockSession(page);
  let unavailable = true;
  await page.route((url) => url.pathname === "/v1/orders", (route) => unavailable
    ? route.fulfill({ status: 503, json: { error: { code: "AUTH_UNAVAILABLE", message: "Identity validation is unavailable." } } })
    : route.fulfill({ json: list([]) }));
  await page.goto("/orders");
  await expect(page.getByRole("alert")).toContainText("We could not check your account.");
  unavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No open errands found" })).toBeVisible();
});

test("anonymous visitors cannot access Order pages", async ({ page }) => {
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ status: 401, json: {} }));
  for (const path of ["/orders", "/orders/new", "/orders/mine", `/orders/${orderId}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("supplier filter and stale pagination use the supported Order contract", async ({ page }) => {
  await mockSession(page);
  const queries: string[] = [];
  await page.route((url) => url.pathname === "/v1/orders", (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params.toString());
    return route.fulfill({ json: list(Number(params.get("page")) === 1 ? [order] : [], Number(params.get("page")), 12, 1) });
  });
  await page.goto("/orders?page=9");
  await expect(page.getByRole("heading", { name: order.itemDescription })).toBeVisible();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await page.locator(".order-filter summary").click();
  await page.getByRole("combobox", { name: "Filter by supplier", exact: true }).click();
  await page.getByRole("option", { name: "Cool Spot COM2", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`supplierId=${supplierId}`));
  await expect(page.getByRole("heading", { name: order.itemDescription })).toBeVisible();
  await expect.poll(() => queries.at(-1)).toContain(`supplierId=${supplierId}`);
  await page.getByRole("combobox", { name: "Filter by supplier" }).click();
  await page.getByRole("option", { name: "All suppliers", exact: true }).click();
  await expect(page).not.toHaveURL(/supplierId=/);
});

test("supplier dropdown searches in one field and supports keyboard selection", async ({ page }) => {
  await mockSession(page);
  const queries: string[] = [];
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    queries.push(query);
    const items = query === "missing" ? [] : [{ id: supplierId, name: "Cool Spot", building_area: "COM2" }];
    return route.fulfill({ json: { items, total: items.length, page: 1, page_size: 20 } });
  });
  await page.goto("/orders/new");
  const input = page.getByRole("combobox", { name: "Pickup supplier" });
  await input.fill("missing");
  await expect(page.getByText("No active suppliers match this search.")).toBeVisible();
  await input.fill("Cool");
  await expect(page.getByRole("option", { name: "Cool Spot COM2" })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("Cool Spot · COM2");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.press("ArrowDown");
  await input.press("Escape");
  await expect(input).toHaveValue("Cool Spot · COM2");
  await input.fill("missing");
  await page.getByLabel("Delivery location", { exact: true }).click();
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "Post errand", exact: true }).click();
  await expect(page.getByText("Select an active supplier.", { exact: true })).toBeVisible();
  expect(queries).toContain("Cool");
  await expect(page.getByText("Find a supplier", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Previous suppliers|Next suppliers/ })).toHaveCount(0);
});

test("supplier dropdown loads later pages on scroll without replacing earlier choices", async ({ page }) => {
  await mockSession(page);
  const suppliers = Array.from({ length: 21 }, (_, index) => ({ id: `supplier-${index}`, name: `Supplier ${index + 1}`, building_area: "COM2" }));
  await page.route((url) => url.pathname === "/api/v1/suppliers", (route) => {
    const current = Number(new URL(route.request().url()).searchParams.get("page"));
    return route.fulfill({ json: { items: suppliers.slice((current - 1) * 20, current * 20), total: 21, page: current, page_size: 20 } });
  });
  await page.goto("/orders/new");
  const input = page.getByRole("combobox", { name: "Pickup supplier" });
  await input.click();
  await expect(page.getByRole("option")).toHaveCount(20);
  await page.getByRole("listbox").evaluate((list) => { list.scrollTop = list.scrollHeight; });
  await expect(page.getByRole("option")).toHaveCount(21);
  await page.getByRole("option", { name: "Supplier 21 COM2", exact: true }).click();
  await expect(input).toHaveValue("Supplier 21 · COM2");
});

test("supplier search ignores stale responses and offers retry after an outage", async ({ page }) => {
  await mockSession(page);
  let unavailable = true;
  await page.route((url) => url.pathname === "/api/v1/suppliers", async (route) => {
    if (unavailable) return route.fulfill({ status: 503, json: { error: { message: "Supplier temporarily unavailable." } } });
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "slow") await new Promise((resolve) => setTimeout(resolve, 800));
    return route.fulfill({ json: { items: query === "missing" ? [] : [{ id: supplierId, name: "Cool Spot", building_area: "COM2" }], total: query === "missing" ? 0 : 1, page: 1, page_size: 20 } });
  });
  await page.goto("/orders/new");
  const input = page.getByRole("combobox", { name: "Pickup supplier" });
  await input.click();
  await expect(page.getByRole("alert")).toContainText("We could not complete your request. Please try again.");
  unavailable = false;
  await page.getByRole("button", { name: "Retry suppliers" }).click();
  await expect(page.getByRole("option", { name: "Cool Spot COM2" })).toBeVisible();
  const slowRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "slow");
  await input.fill("slow");
  await slowRequest;
  const slowResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("q") === "slow");
  await input.fill("missing");
  await expect(page.getByText("No active suppliers match this search.")).toBeVisible();
  await slowResponse;
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("concurrent clicks send one creation and a lost response retains the same retry key", async ({ page }) => {
  await mockSession(page);
  const keys: string[] = [];
  await page.route((url) => url.pathname === "/v1/orders", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) { await new Promise((resolve) => setTimeout(resolve, 150)); await route.abort("failed"); }
    else await route.fulfill({ status: 200, json: participant });
  });
  await page.goto("/orders/new"); await fillForm(page);
  await page.getByRole("button", { name: "Post errand", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole("alert")).toContainText("Check your connection");
  expect(keys).toHaveLength(1);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Your errand is open" })).toBeVisible();
  expect(keys[0]).toBe(keys[1]);
});
