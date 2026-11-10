import { expect, test, type Page } from "@playwright/test";
import { ChatFixture } from "./chat-fixture";

async function expectBoundedPage(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    vertical: document.documentElement.scrollHeight - innerHeight,
    horizontal: document.documentElement.scrollWidth - innerWidth,
    scrollY,
  }))).toEqual({ vertical: 0, horizontal: 0, scrollY: 0 });
  await expect(page.locator(".workspace-topbar")).toBeInViewport({ ratio: 1 });
  const mobile = (page.viewportSize()?.width ?? 0) < 1024;
  await expect(page.getByRole("navigation", { name: mobile ? "Mobile navigation" : "Main navigation", exact: true })).toBeInViewport({ ratio: 1 });
}

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 667, height: 375 },
  { width: 768, height: 600 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`long directory and history stay inside ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const fixture = new ChatFixture(); fixture.conversationCount = 40;
    for (let index = 1; index <= 200; index++) fixture.message(index % 2 ? "alice" : "bob", `History ${index}\nSecond line 😀`);
    await page.setViewportSize(viewport); await fixture.install(page);
    await page.goto("/messages");
    const directory = page.getByRole("region", { name: "Conversation list and blocked users" });
    await expect(directory.locator(".chat-conversation")).toHaveCount(40);
    await expectBoundedPage(page);
    expect(await directory.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await directory.hover(); await page.mouse.wheel(0, 10000);
    await expect.poll(() => directory.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByLabel("Find someone by username")).toBeInViewport({ ratio: 1 });
    await expectBoundedPage(page);

    await page.goto("/messages/ab");
    const history = page.getByLabel("Message history", { exact: true });
    await expect(page.locator(".chat-message")).toHaveCount(50);
    await expect(history.getByText("History 200\nSecond line 😀", { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByLabel("Message", { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeInViewport({ ratio: 1 });
    await expectBoundedPage(page);
    expect(await history.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    for (let index = 1; index <= 10; index++) fixture.emit("alice", { type: "message.created", message: fixture.message("bob", `Live ${index}`) });
    await expect(history.getByText("Live 10", { exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByLabel("Message", { exact: true }).fill("Still fits after sending");
    await page.getByLabel("Message", { exact: true }).press("Enter");
    await expect(history.getByText("Still fits after sending", { exact: true })).toBeInViewport({ ratio: 1 });
    await expectBoundedPage(page);
    await page.screenshot({ path: testInfo.outputPath(`bounded-chat-${viewport.width}x${viewport.height}.png`), fullPage: true });
    // Reaching either end of an inner scroll pane must not scroll the document.
    await history.hover(); await page.mouse.wheel(0, -100000);
    await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBe(0);
    await page.mouse.wheel(0, -1000); await expectBoundedPage(page);
  });
}

test("keeps the reading position on incoming messages and older pages", async ({ page }) => {
  const fixture = new ChatFixture();
  for (let index = 1; index <= 150; index++) fixture.message("bob", `Message ${index}`);
  await page.setViewportSize({ width: 360, height: 640 }); await fixture.install(page);
  await page.goto("/messages/ab");
  const history = page.getByLabel("Message history", { exact: true });
  await expect(page.locator(".chat-message")).toHaveCount(50);
  await history.evaluate((element) => { element.scrollTop = 300; element.dispatchEvent(new Event("scroll")); });
  const beforeIncoming = await history.evaluate((element) => element.scrollTop);
  fixture.emit("alice", { type: "message.created", message: fixture.message("bob", "New while reading") });
  await expect(page.locator(".chat-message")).toHaveCount(51);
  expect(await history.evaluate((element) => element.scrollTop)).toBe(beforeIncoming);

  await history.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  const anchor = history.getByText("Message 101", { exact: true });
  const beforeOlder = (await anchor.boundingBox())!.y;
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.locator(".chat-message")).toHaveCount(101);
  await expect.poll(async () => (await anchor.boundingBox())!.y).toBeCloseTo(beforeOlder, 0);
  await expectBoundedPage(page);

  await history.evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
  await page.setViewportSize({ width: 360, height: 568 });
  await expect(history.getByText("New while reading", { exact: true })).toBeInViewport({ ratio: 1 });
  await expectBoundedPage(page);
});

test("small mobile screens reserve space for the admin mode switch and validation", async ({ page }, testInfo) => {
  const fixture = new ChatFixture();
  for (let index = 1; index <= 80; index++) fixture.message("bob", `Message ${index}`);
  await page.setViewportSize({ width: 320, height: 568 }); await fixture.install(page);
  await page.route("**/v1/users/me", (route) => route.fulfill({ json: { ...fixture.alice, email: "alice@u.nus.edu", systemRole: "ADMIN" } }));
  await page.goto("/messages/ab");
  await expect(page.getByRole("group", { name: "Workspace mode" })).toBeInViewport({ ratio: 1 });
  await page.getByLabel("Message", { exact: true }).fill("😀".repeat(4097));
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("4,096");
  await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("Message", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeInViewport({ ratio: 1 });
  await expectBoundedPage(page);
  await page.screenshot({ path: testInfo.outputPath("bounded-chat-admin-validation-320x568.png"), fullPage: true });
});

test("expanded blocked users stay within the directory pane", async ({ page }) => {
  const fixture = new ChatFixture(); await fixture.install(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route((url) => url.pathname === "/v1/chat/blocks", (route) => route.fulfill({ json: {
    items: Array.from({ length: 40 }, (_, index) => ({ ...fixture.bob, userId: `blocked-${index}`, displayName: `Blocked person ${index}` })), nextCursor: null,
  } }));
  await page.goto("/messages");
  await page.getByText("Blocked users (40)", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Unblock Blocked person 39", exact: true })).toBeAttached();
  await expectBoundedPage(page);
  const directory = page.getByRole("region", { name: "Conversation list and blocked users" });
  await directory.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("button", { name: "Unblock Blocked person 39", exact: true })).toBeInViewport({ ratio: 1 });
  await expectBoundedPage(page);
});

for (const role of ["USER", "ADMIN"] as const) {
  test(`wider text metrics keep the ${role} workspace inside 320px`, async ({ page }, testInfo) => {
    const fixture = new ChatFixture(); await fixture.install(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route("**/v1/users/me", (route) => route.fulfill({ json: { ...fixture.alice, email: "alice@u.nus.edu", systemRole: role } }));
    await page.goto("/messages/ab");
    await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
    // Font metrics and user text-spacing preferences must not widen the grid track.
    await page.addStyleTag({ content: "html { letter-spacing: .12em; }" });
    await expectBoundedPage(page);
    if (role === "ADMIN") await expect(page.getByRole("group", { name: "Workspace mode" })).toBeInViewport({ ratio: 1 });
    const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    for (const link of await navigation.getByRole("link").all()) {
      await expect(link.locator("span")).toBeInViewport({ ratio: 1 });
    }
    await expect(page.getByLabel("Message", { exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath(`wider-text-${role}-320.png`), fullPage: true });
  });
}
