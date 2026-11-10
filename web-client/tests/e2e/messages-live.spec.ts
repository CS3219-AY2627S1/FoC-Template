import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Opt-in acceptance against a loopback User/Chat/PostgreSQL/RabbitMQ stack, locally or in CI.
// Creates only uniquely named test accounts; never resets databases or reads unrelated mail.
test("two real signed-in browsers exchange, recover and read private messages", async ({ browser, playwright, baseURL }, testInfo) => {
  test.skip(process.env.CHAT_LIVE_E2E !== "1", "Requires the configured local User/Chat/Mailpit/RabbitMQ stack.");
  test.setTimeout(120000);
  const origin = new URL(baseURL!);
  if (!["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Live Chat acceptance is local-only.");
  const mailOrigin = new URL(process.env.CHAT_LIVE_MAILPIT_URL ?? "http://127.0.0.1:8025");
  if (!["localhost", "127.0.0.1"].includes(mailOrigin.hostname)) throw new Error("Live Chat mail access is local-only.");
  const api = await playwright.request.newContext({ baseURL: origin.origin });
  const mail = await playwright.request.newContext({ baseURL: mailOrigin.origin });
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  for (const context of contexts) context.setDefaultTimeout(10000);
  const password = `Chat6!${randomBytes(18).toString("hex")}`;

  async function account(label: string) {
    const username = `phase6${label}${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const email = `${username}@u.nus.edu`;
    const registration = await api.post("/v1/auth/registrations", { data: { username, email, password, displayName: `Chat${label}` } });
    expect(registration.status()).toBe(202);
    let otp: string | undefined;
    await expect.poll(async () => {
      // Mailpit's documented filtered latest endpoint restricts access to this new test recipient.
      const response = await mail.get("/view/latest.txt", { params: { query: `to:"${email}"` } });
      if (response.ok()) otp = (await response.text()).match(/\b\d{6}\b/)?.[0];
      return !!otp;
    }, { timeout: 15000 }).toBe(true);
    const verified = await api.post("/v1/auth/email-verifications", { data: { email, otp } });
    expect(verified.status()).toBe(201);
    const { userId } = await verified.json();
    return { username, email, userId };
  }
  async function signIn(page: Page, email: string) {
    await page.bringToFront();
    await page.goto(`${origin.origin}/sign-in`);
    await page.getByLabel("NUS email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
  }
  const list = (page: Page) => page.getByRole("list", { name: "Messages", exact: true });
  try {
    const alice = await account("Alice"), bob = await account("Bob"), outsider = await account("Outsider");
    const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
    await signIn(a, alice.email); await signIn(b, bob.email); await signIn(c, outsider.email);
    await a.goto(`${origin.origin}/messages`);
    await a.getByLabel("Find someone by username").fill(bob.username.slice(0, -2));
    await a.getByRole("button", { name: new RegExp(`@${bob.username}`) }).click();
    await expect(a.getByLabel("Message", { exact: true })).toBeEnabled();
    const conversationUrl = a.url();
    await b.goto(`${origin.origin}/messages`);
    await a.bringToFront();
    await a.getByLabel("Message", { exact: true }).fill("  Hello  B\nsecond line 😀  ");
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await expect(list(a).getByText("Sent", { exact: true })).toHaveCount(1);
    await expect(b.getByLabel("1 unread messages")).toBeVisible();
    await b.bringToFront(); await b.goto(conversationUrl);
    await expect(list(b).getByText("Hello  B\nsecond line 😀", { exact: true })).toHaveCount(1);
    await expect(b.getByLabel("1 unread messages")).toHaveCount(0);
    await b.getByLabel("Message", { exact: true }).fill("Hello Alice"); await b.getByLabel("Message", { exact: true }).press("Enter");
    await expect(list(a).getByText("Hello Alice", { exact: true })).toHaveCount(1);
    // Headless Playwright forces focus. Unselected-thread unread behavior uses real browser navigation;
    // visibility/blur gating is separately exercised by component tests with browser lifecycle events.
    await a.goto(`${origin.origin}/messages`);
    await b.getByLabel("Message", { exact: true }).fill("Unread while closed"); await b.getByLabel("Message", { exact: true }).press("Enter");
    await expect(a.getByLabel("1 unread messages")).toBeVisible();
    await a.bringToFront(); await a.goto(conversationUrl);
    await expect(list(a).getByText("Unread while closed", { exact: true })).toHaveCount(1);
    await expect(a.getByLabel("1 unread messages")).toHaveCount(0);
    await a.getByRole("button", { name: "Block user", exact: true }).focus(); await a.keyboard.press("Enter");
    await expect(a.getByLabel("Message", { exact: true })).toBeDisabled();
    await a.getByRole("button", { name: "Unblock user", exact: true }).click();
    await expect(a.getByLabel("Message", { exact: true })).toBeEnabled();
    // Refresh restores persisted history/read state through actual cookie session refresh and HTTP.
    await a.reload(); await expect(list(a).getByRole("listitem")).toHaveCount(3);
    await c.goto(conversationUrl); await expect(c.getByRole("alert")).toContainText("unavailable");
    await expect(list(c).getByRole("listitem")).toHaveCount(0);
    await a.setViewportSize({ width: 360, height: 900 });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.screenshot({ path: testInfo.outputPath("chat-live-360.png"), fullPage: true });
    await a.setViewportSize({ width: 1440, height: 1000 });
    await a.screenshot({ path: testInfo.outputPath("chat-live-1440.png"), fullPage: true });
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await api.dispose(); await mail.dispose();
  }
});
