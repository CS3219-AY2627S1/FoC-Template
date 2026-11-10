import { expect, test, type Page } from "@playwright/test";
import { ChatFixture } from "./chat-fixture";
const messageList = (page: Page) => page.getByRole("list", { name: "Messages", exact: true });

for (const width of [360, 768, 1024, 1440]) {
  test(`search, open and send accessibly at ${width}px`, async ({ page }, testInfo) => {
    const fixture = new ChatFixture(); fixture.openPair = false;
    await page.setViewportSize({ width, height: 960 }); await fixture.install(page);
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
    const search = page.getByLabel("Find someone by username");
    await search.fill("bo");
    await page.getByRole("button", { name: /@bob/ }).focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/messages\/ab$/);
    await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
    await page.getByLabel("Message", { exact: true }).fill("  Hello  B\nsecond line 😀  ");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const messages = page.getByRole("list", { name: "Messages", exact: true });
    await expect(messages.getByText("Hello  B\nsecond line 😀", { exact: true })).toHaveCount(1);
    await expect(messages.getByText("Sent", { exact: true })).toHaveCount(1);
    expect(fixture.messages).toHaveLength(1);
    expect(fixture.messages[0].text).toBe("Hello  B\nsecond line 😀");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("group", { name: "Workspace mode" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`messages-${width}.png`), fullPage: true });
    if (width < 768) {
      await page.getByRole("link", { name: "Back to conversations" }).click();
      await expect(search).toBeVisible();
      await expect(page.getByRole("link", { name: /Bob Lim/ })).toBeVisible();
    }
  });
}

test("retries with the same identity, keeps failed text and does not replay on reconnect", async ({ page }) => {
  const fixture = new ChatFixture(); await fixture.install(page); await page.goto("/messages/ab");
  await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
  fixture.rejectNextSend = true;
  await page.getByLabel("Message", { exact: true }).fill("Keep my draft"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Not confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry message", exact: true })).toBeEnabled();
  expect(fixture.sends).toHaveLength(1);
  await page.getByRole("button", { name: "Retry message", exact: true }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  expect(fixture.sends[0].clientMessageId).toBe(fixture.sends[1].clientMessageId);
  expect(fixture.messages).toHaveLength(1);
  await expect(messageList(page).getByText("Keep my draft", { exact: true })).toHaveCount(1);
});

test("validates raw Unicode boundaries and displays message content as plain text", async ({ page }) => {
  const fixture = new ChatFixture(); await fixture.install(page); await page.goto("/messages/ab");
  const composer = page.getByLabel("Message", { exact: true }); await expect(composer).toBeEnabled();
  await composer.fill("😀".repeat(4097)); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("4,096"); expect(fixture.sends).toHaveLength(0);
  await composer.fill("😀".repeat(4096)); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Sent", { exact: true })).toHaveCount(1);
  await composer.fill('<img src=x onerror="alert(1)">'); await composer.press("Enter");
  await expect(messageList(page).getByText('<img src=x onerror="alert(1)">', { exact: true })).toHaveCount(1);
  await expect(page.locator(".chat-messages img")).toHaveCount(0);
});

test("preserves history through bilateral blocks, unblocks and deleted counterparts", async ({ page }) => {
  const fixture = new ChatFixture(); fixture.message("bob", "Retained history"); await fixture.install(page);
  await page.goto("/messages/ab"); await expect(messageList(page).getByText("Retained history", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Block user", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
  fixture.blocks.add("bob"); await page.getByRole("button", { name: "Unblock user", exact: true }).click();
  await expect(page.getByText("Messaging is blocked for this conversation.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
  fixture.blocks.clear(); fixture.bob = { ...fixture.bob, accountStatus: "DELETED", displayName: "Deleted User", username: null };
  await page.getByRole("button", { name: "Refresh conversations" }).click();
  await expect(page.getByText("This account has been deleted.", { exact: false })).toBeVisible();
  await expect(page.locator(".chat-thread-heading").getByText("Deleted User", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-thread-heading").getByText("@bob")).toHaveCount(0);
  await expect(messageList(page).getByText("Retained history", { exact: true })).toHaveCount(1);
});

test("loads older pages and catches up after broker recovery without duplicate bubbles", async ({ page }) => {
  const fixture = new ChatFixture(); for (let index = 1; index <= 55; index++) fixture.message("bob", `Older message ${index}`);
  await fixture.install(page); await page.goto("/messages/ab");
  await expect(page.getByRole("list", { name: "Messages", exact: true }).getByRole("listitem")).toHaveCount(50);
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.getByRole("list", { name: "Messages", exact: true }).getByRole("listitem")).toHaveCount(55);
  fixture.message("bob", "Missed while disconnected"); fixture.emit("alice", { type: "sync.required", reason: "broker recovered" });
  await expect(messageList(page).getByText("Missed while disconnected", { exact: true })).toHaveCount(1);
  fixture.emit("alice", { type: "message.created", message: fixture.messages.at(-1) });
  await expect(messageList(page).getByText("Missed while disconnected", { exact: true })).toHaveCount(1);
});

test("denies unavailable deep links and redirects anonymous users", async ({ page }) => {
  const fixture = new ChatFixture(); await fixture.install(page); await page.goto("/messages/outsider");
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
  await page.route("**/v1/auth/sessions/refresh", (route) => route.fulfill({ status: 401, json: { error: { code: "INVALID_SESSION", message: "Sign in" } } }));
  await page.reload(); await expect(page).toHaveURL(/\/sign-in$/);
});

test("retains unread counts after a failed read and synchronizes persisted reads from another tab", async ({ page }) => {
  const fixture = new ChatFixture(); fixture.message("bob", "Unread message"); fixture.failNextRead = true;
  await fixture.install(page); await page.goto("/messages/ab");
  await expect(page.getByRole("alert")).toContainText("Read status could not be saved");
  await expect(page.getByLabel("1 unread messages")).toBeVisible();
  await page.getByRole("button", { name: "Retry read update" }).click();
  await expect(page.getByLabel("1 unread messages")).toHaveCount(0);
  await page.goto("/messages");
  const incoming = fixture.message("bob", "Read in another tab"); fixture.emit("alice", { type: "message.created", message: incoming });
  await expect(page.getByLabel("1 unread messages")).toBeVisible();
  fixture.reads.set("alice", 2);
  fixture.emit("alice", { type: "unread.updated", conversationId: "ab", lastReadSequence: 2, unreadCount: 0, boundarySequence: 2 });
  await expect(page.getByLabel("1 unread messages")).toHaveCount(0);
});

test("editing a failed draft creates a new send identity", async ({ page }) => {
  const fixture = new ChatFixture(); await fixture.install(page); await page.goto("/messages/ab");
  fixture.rejectNextSend = true;
  await page.getByLabel("Message", { exact: true }).fill("Original draft"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Edit as new message" }).click();
  await page.getByLabel("Message", { exact: true }).fill("Edited draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(messageList(page).getByText("Edited draft", { exact: true })).toHaveCount(1);
  expect(fixture.sends).toHaveLength(2);
  expect(fixture.sends[0].clientMessageId).not.toBe(fixture.sends[1].clientMessageId);
});
