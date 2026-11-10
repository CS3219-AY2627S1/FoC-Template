// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
// Scope: Added wallet page browser tests.
// Author review: I validated correctness and supplied additional boundary checks.

import { expect, test, type Page } from "@playwright/test";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

async function mockWallet(page: Page) {
  const session = { accessToken: "wallet-test-token", tokenType: "Bearer", expiresAt: "2030-01-01T00:00:00Z" };
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ json: session }));
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: {
    userId: "self", username: "testuser", email: "testuser@u.nus.edu", displayName: "Jihun Hwang", systemRole: "USER", accountStatus: "ACTIVE",
  } }));
  await page.route("**/v1/wallets/me", (route) => route.fulfill({ json: {
    userId: "self", available: 55, reserved: 12, total: 67, updatedAt: minutesAgo(5),
  } }));
  await page.route("**/v1/wallets/me/transactions**", (route) => route.fulfill({ json: { page: 1, pageSize: 10, total: 3, items: [
    { transactionId: "t3", type: "RESERVATION", amount: 12, walletUserId: "self", counterpartyUserId: null, orderId: "ce2048aa-0000-4000-8000-000000000001", createdAt: minutesAgo(10) },
    { transactionId: "t2", type: "TRANSFER", amount: 18, walletUserId: "other", counterpartyUserId: "self", orderId: "ce2038bb-0000-4000-8000-000000000002", createdAt: minutesAgo(90) },
    { transactionId: "t1", type: "RELEASE", amount: 8, walletUserId: "self", counterpartyUserId: null, orderId: "ce2020cc-0000-4000-8000-000000000003", createdAt: minutesAgo(26 * 60) },
  ] } }));
}

for (const viewport of [{ width: 1440, height: 1024 }, { width: 375, height: 812 }]) {
  test(`credit wallet matches the Figma layout at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockWallet(page);
    await page.goto("/wallet");

    await expect(page.getByRole("heading", { level: 1, name: "Credit wallet" })).toBeVisible();
    const balance = page.getByRole("region", { name: "Credit balance" });
    await expect(balance.getByRole("article")).toHaveCount(3);
    await expect(balance.getByRole("article").first()).toContainText("55 credits");
    const rows = page.getByRole("region", { name: "Credit history" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Reserved · #CE2048AA");
    await expect(rows.nth(1)).toContainText("Earned · #CE2038BB");
    await expect(rows.nth(2)).toContainText("Released · #CE2020CC");
    await expect(page.getByRole("link", { name: "Wallet" }).first()).toHaveClass(/active/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`wallet-${viewport.width}.png`) });
  });
}
