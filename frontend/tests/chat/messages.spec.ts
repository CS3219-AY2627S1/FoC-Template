// AI-assisted (Claude Opus 5.5): regression tests for the Messages page — ticket
// handshake, live send/receive over a mocked chat-service socket, re-auth.
// Reviewed by authors.
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { CLIENT_PROFILE, mockApi, seedToken, storedToken } from "../support/api-mocks";

const ME = CLIENT_PROFILE.id;
const COURIER = "44444444-4444-4444-4444-444444444444";
const CONV = "c0ffee00-0000-4000-8000-000000000001";
const ORDER = "0rder000-0000-4000-8000-000000000001";
const NOW = new Date().toISOString();

function message(seq: number, extra: Record<string, unknown>) {
  return {
    id: `m-${seq}`,
    conversation_id: CONV,
    seq,
    sender_id: null,
    client_msg_id: null,
    kind: "text",
    body: null,
    payload: null,
    reply_to_id: null,
    created_at: NOW,
    edited_at: null,
    deleted_at: null,
    ...extra,
  };
}

const ACCEPTED = message(1, { kind: "system", payload: { key: "order.accepted", params: {} } });

function conversation(lastSeq = 1, unread = 1) {
  return {
    id: CONV,
    kind: "group",
    unique_key: `order:${ORDER}`,
    title: "Order 0rder000",
    metadata: { order_id: ORDER },
    last_seq: lastSeq,
    last_message_at: NOW,
    closed_at: null,
    purge_after: null,
    created_at: NOW,
    members: [
      { user_id: ME, label: "requester", history_from_seq: 0, delivered_seq: 0, read_seq: 0, joined_at: NOW },
      { user_id: COURIER, label: "courier", history_from_seq: 0, delivered_seq: 0, read_seq: 0, joined_at: NOW },
    ],
    me: { history_from_seq: 0, delivered_seq: 0, read_seq: lastSeq - unread, unread_count: unread },
    last_message: ACCEPTED,
  };
}

const ORDER_BODY = {
  order_id: ORDER,
  name: "Bubble tea from Frontier",
  details: "Less sugar",
  reward: 5,
  deadline: NOW,
  supplier_id: "s1",
  requester_id: ME,
  courier_id: COURIER,
  pickup_location: "Frontier",
  delivery_location: "COM1",
  status: "ACCEPTED",
  created_at: NOW,
};

function chatMocks(ticketStatus = 201) {
  let tickets = 0;
  return {
    issued: () => tickets,
    responders: {
      "POST /api/chat/ws-ticket": () => {
        tickets += 1;
        return ticketStatus === 201
          ? { status: 201, body: { ticket: `ticket-${tickets}`, expires_at: NOW, expires_in: 30 } }
          : { status: ticketStatus, body: { code: "unauthorized", message: "Invalid or expired token." } };
      },
      "GET /api/chat/conversations": () => ({ body: [conversation()] }),
      [`GET /api/chat/conversations/${CONV}`]: () => ({ body: conversation() }),
      [`GET /api/chat/conversations/${CONV}/messages`]: () => ({
        body: { messages: [ACCEPTED], has_more: false },
      }),
      [`GET /api/orders/${ORDER}`]: () => ({ body: ORDER_BODY }),
    },
  };
}

function ready(ws: WebSocketRoute) {
  ws.send(JSON.stringify({ type: "ready", data: { user_id: ME, connection_id: "x", server_time: NOW } }));
}

test.describe("chat", () => {
  test("opens with a one-time ticket and exchanges messages live", async ({ page }) => {
    const chat = chatMocks();
    const socketUrls: string[] = [];
    const sent: Record<string, unknown>[] = [];
    let server: WebSocketRoute | null = null;

    await page.routeWebSocket(/\/api\/chat\/ws/, (ws) => {
      socketUrls.push(ws.url());
      server = ws;
      ready(ws);
      ws.onMessage((raw) => {
        const frame = JSON.parse(String(raw));
        sent.push(frame);
        if (frame.type === "send") {
          const data = frame.data;
          const stored = message(2, {
            sender_id: ME,
            client_msg_id: data.client_msg_id,
            body: data.body,
          });
          ws.send(JSON.stringify({ type: "ack", req_id: frame.req_id, data: { message: stored, duplicate: false } }));
        }
      });
    });
    await seedToken(page);
    const api = await mockApi(page, chat.responders);

    await page.goto("/messages");

    const item = page.getByTestId("chat-item");
    await expect(item).toContainText("Bubble tea from Frontier");
    await expect(item.getByTestId("unread-badge")).toHaveText("1");
    await expect(page.getByTestId("chat-status")).toHaveText("Live");

    // The socket URL carries a one-time ticket, never the JWT. (In dev, React's
    // StrictMode starts and stops the chat once, so an unused ticket may come first.)
    const token = await storedToken(page);
    expect(socketUrls).toHaveLength(1);
    expect(socketUrls[0]).toMatch(/\?ticket=ticket-\d+$/);
    expect(socketUrls[0]).not.toContain(token ?? "<no token>");
    expect(api.lastCall("POST", "/api/chat/ws-ticket")?.authorization).toBe(`Bearer ${token}`);

    await item.click();
    await expect(page).toHaveURL(`/messages/${CONV}`);
    await expect(page.getByTestId("chat-title")).toHaveText("Bubble tea from Frontier");
    await expect(page.getByTestId("system-message")).toContainText("A courier accepted this order");
    await expect(page.getByRole("link", { name: "View order" })).toHaveAttribute("href", `/orders/${ORDER}`);
    // Opening the chat marks it read.
    await expect.poll(() => sent.some((f) => f.type === "read")).toBe(true);

    await page.getByLabel("Message", { exact: true }).fill("Hi! Less ice please");
    await page.getByLabel("Message", { exact: true }).press("Enter");
    const mine = page.locator('[data-testid="message"][data-mine="true"]');
    await expect(mine).toContainText("Hi! Less ice please");
    await expect(mine.getByTestId("tick")).toHaveAttribute("data-tick", "sent");
    expect(sent.find((f) => f.type === "send")?.data).toMatchObject({
      conversation_id: CONV,
      kind: "text",
      body: "Hi! Less ice please",
    });

    // The courier answers; it shows up live with their role as the name.
    server!.send(
      JSON.stringify({
        type: "message.new",
        data: { message: message(3, { sender_id: COURIER, body: "On my way" }) },
      }),
    );
    const theirs = page.locator('[data-testid="message"][data-mine="false"]');
    await expect(theirs).toContainText("On my way");
    await expect(theirs).toContainText("Courier");

    // A shared location opens in Google Maps.
    server!.send(
      JSON.stringify({
        type: "message.new",
        data: {
          message: message(4, {
            sender_id: COURIER,
            kind: "location",
            payload: { lat: 1.2966, lng: 103.7764, label: "At Frontier" },
          }),
        },
      }),
    );
    await expect(page.getByRole("link", { name: "At Frontier" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps?q=1.2966,103.7764",
    );
    expect(socketUrls).toHaveLength(1);
  });

  test("sends and shows photos, loading them with the login token", async ({ page }) => {
    const chat = chatMocks();
    // 1x1 PNG
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "*" };
    const sent: Record<string, unknown>[] = [];
    let server: WebSocketRoute | null = null;
    await page.routeWebSocket(/\/api\/chat\/ws/, (ws) => {
      server = ws;
      ready(ws);
      ws.onMessage((raw) => {
        const frame = JSON.parse(String(raw));
        sent.push(frame);
        if (frame.type === "send") {
          const stored = message(2, {
            sender_id: ME,
            client_msg_id: frame.data.client_msg_id,
            kind: "image",
            body: frame.data.body,
            payload: { ...frame.data.payload, mime: "image/png", size: PNG.length, width: 1, height: 1 },
          });
          ws.send(JSON.stringify({ type: "ack", req_id: frame.req_id, data: { message: stored, duplicate: false } }));
        }
      });
    });
    await seedToken(page);
    await mockApi(page, chat.responders);
    const token = await storedToken(page);

    const uploads: string[] = [];
    await page.route(`**/api/chat/conversations/${CONV}/attachments`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      uploads.push(route.request().postDataBuffer()?.toString("latin1") ?? "");
      await route.fulfill({
        status: 201,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ attachment_id: "att-1", content_type: "image/png", size: PNG.length, width: 1, height: 1 }),
      });
    });
    const photoAuth: Record<string, string | undefined> = {};
    await page.route(`**/api/chat/conversations/${CONV}/attachments/*`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const id = new URL(route.request().url()).pathname.split("/").pop()!;
      photoAuth[id] = route.request().headers()["authorization"];
      if (id === "att-gone") {
        await route.fulfill({ status: 404, headers: cors, contentType: "application/json", body: '{"code":"not_found","message":"photo not found"}' });
        return;
      }
      await route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: PNG });
    });

    await page.goto(`/messages/${CONV}`);
    await expect(page.getByTestId("chat-status")).toHaveText("Live");

    // Too large: refused before uploading.
    await page.getByTestId("photo-input").setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.getByText("Photos must be 5 MB or smaller.")).toBeVisible();
    expect(uploads).toHaveLength(0);

    // Typed text becomes the caption.
    await page.getByLabel("Message", { exact: true }).fill("Receipt");
    await page.getByTestId("photo-input").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await expect.poll(() => uploads.length).toBe(1);
    expect(uploads[0]).toContain('filename="receipt.png"');
    await expect.poll(() => sent.find((f) => f.type === "send")?.data).toMatchObject({
      kind: "image",
      body: "Receipt",
      payload: { attachment_id: "att-1" },
    });
    const mine = page.locator('[data-testid="message"][data-mine="true"]');
    await expect(mine.getByTestId("chat-photo")).toHaveAttribute("src", /^blob:/);
    await expect(mine).toContainText("Receipt");
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
    expect(photoAuth["att-1"]).toBe(`Bearer ${token}`);

    // The courier's photo arrives live; a photo the server refuses shows a placeholder.
    for (const [seq, id] of [[3, "att-2"], [4, "att-gone"]] as const) {
      server!.send(
        JSON.stringify({
          type: "message.new",
          data: {
            message: message(seq, {
              sender_id: COURIER,
              kind: "image",
              payload: { attachment_id: id, mime: "image/png", width: 1, height: 1 },
            }),
          },
        }),
      );
    }
    const theirs = page.locator('[data-testid="message"][data-mine="false"]');
    await expect(theirs.nth(0).getByTestId("chat-photo")).toHaveAttribute("src", /^blob:/);
    await expect(theirs.nth(1)).toContainText("Photo unavailable");

    // Tap to view full size.
    await theirs.nth(0).getByRole("button", { name: "View photo" }).click();
    await expect(page.getByRole("dialog").getByRole("img", { name: "Photo" })).toBeVisible();
  });

  test("order lists show a chat button once a courier has accepted", async ({ page }) => {
    const chat = chatMocks();
    const OPEN_ORDER = {
      ...ORDER_BODY,
      order_id: "open0000-0000-4000-8000-000000000002",
      name: "Still open",
      status: "OPEN",
      courier_id: null,
    };
    await page.routeWebSocket(/\/api\/chat\/ws/, (ws) => ready(ws));
    await seedToken(page);
    await mockApi(page, {
      ...chat.responders,
      "GET /api/orders/requested/ongoing": () => ({ body: [ORDER_BODY, OPEN_ORDER] }),
      "GET /api/orders/requested/completed": () => ({ body: [] }),
      "GET /api/orders/assigned": () => ({ body: [{ ...ORDER_BODY, courier_id: ME }] }),
      "GET /api/orders/assigned/completed": () => ({ body: [] }),
    });

    // Requester: only the accepted order has a chat; it carries the unread count.
    await page.goto("/orders/mine");
    const button = page.getByTestId("order-chat");
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAccessibleName("Chat, 1 unread");
    await expect(page.getByText("Still open")).toBeVisible();

    // Courier: the same chat from My deliveries.
    await page.goto("/deliveries");
    await expect(page.getByTestId("order-chat")).toHaveCount(1);
    await page.getByTestId("order-chat").click();
    await expect(page).toHaveURL(`/messages/${CONV}`);
    await expect(page.getByTestId("chat-title")).toHaveText("Bubble tea from Frontier");
  });

  test("reconnects with a fresh ticket when the server asks to re-authenticate", async ({ page }) => {
    const chat = chatMocks();
    const urls: string[] = [];
    await page.routeWebSocket(/\/api\/chat\/ws/, (ws) => {
      urls.push(ws.url());
      ready(ws);
      if (urls.length === 1) ws.close({ code: 4002, reason: "session expired" });
    });
    await seedToken(page);
    await mockApi(page, chat.responders);

    await page.goto("/messages");

    await expect.poll(() => urls.length).toBe(2);
    // A ticket works once, so the reconnect must have fetched a new one.
    expect(urls[1]).not.toEqual(urls[0]);
    expect(chat.issued()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("chat-status")).toHaveText("Live");
  });

  test("an expired login cannot open the chat and is sent to the login page", async ({ page }) => {
    const chat = chatMocks(401);
    let sockets = 0;
    await page.routeWebSocket(/\/api\/chat\/ws/, () => {
      sockets += 1;
    });
    await seedToken(page);
    await mockApi(page, chat.responders);

    await page.goto("/messages");

    await expect(page).toHaveURL(/\/login$/);
    expect(await storedToken(page)).toBeNull();
    expect(sockets).toBe(0);
  });
});
