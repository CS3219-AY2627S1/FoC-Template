import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatService, messageValidation, type ChatMessage, type Conversation } from "../../src/api/chat-service";
import { ApiRequestError } from "../../src/api/client";
import { ChatController } from "../../src/chat/controller";

const message = (sequence: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({ messageId: `m${sequence}`, conversationId: "ab", senderUserId: "bob", clientMessageId: `client${sequence}`, sequence, text: `Message ${sequence}`, createdAt: "2026-10-21T01:00:00Z", ...extra });
const summary: Conversation = { conversationId: "ab", counterpart: { userId: "bob", displayName: "Bob", username: "bob", accountStatus: "ACTIVE" }, createdAt: "2026-10-21T00:00:00Z", latestMessage: message(1), lastSequence: 1, lastReadSequence: 0, unreadCount: 1, blocked: false, messagingAvailable: true };
let controller: ChatController;
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(chatService, "conversations").mockResolvedValue({ items: [summary], nextCursor: null });
  vi.spyOn(chatService, "conversation").mockResolvedValue(summary);
  vi.spyOn(chatService, "blocks").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(chatService, "history").mockImplementation(async (_id, _token, bounds) => ({ items: bounds?.afterSequence !== undefined ? [] : [message(1)], boundarySequence: 1, lastReadSequence: 0, hasMore: false }));
  vi.spyOn(chatService, "read").mockImplementation(async (conversationId, upToSequence) => ({ conversationId, lastReadSequence: upToSequence, boundarySequence: upToSequence, unreadCount: 0 }));
  send = vi.fn();
  controller = new ChatController("alice", (operation) => operation("test-token"), async () => "test-token", () => ({ start: vi.fn(), stop: vi.fn(), reconnect: vi.fn(), send }));
  controller.start();
});
afterEach(() => { controller.stop(); vi.restoreAllMocks(); });
async function open() {
  controller.select("ab");
  await vi.waitFor(() => { expect(controller.getSnapshot().threads.ab?.loaded).toBe(true); expect(controller.getSnapshot().threads.ab?.recovering).toBe(false); });
}

describe("Chat validation", () => {
  it("counts Unicode code points before trimming and preserves internal whitespace", () => {
    expect(messageValidation("😀".repeat(4096))).toBeNull();
    expect(messageValidation("😀".repeat(4097))).toMatch(/4,096/);
    expect(messageValidation(" " + "a".repeat(4096))).toMatch(/4,096/);
    expect(messageValidation(" \t\n ")).toMatch(/Write/);
    expect(messageValidation("  Hello  B\nsecond line 😀  ")).toBeNull();
    expect(messageValidation("hello\0")).toMatch(/unsupported/);
    expect(messageValidation("\ud800")).toMatch(/unsupported/);
    expect(messageValidation("\u0085\u001c")).toMatch(/Write/);
    expect(messageValidation("\ufeff")).toBeNull();
  });
});

describe("Conversation recovery and unread state", () => {
  it("refreshes current counterpart names across every displayed conversation page", async () => {
    let renamed = false;
    const page = (start: number) => Array.from({ length: 20 }, (_, index) => ({ ...summary, conversationId: start + index === 0 ? "ab" : `id${start + index}`, counterpart: { ...summary.counterpart, displayName: renamed ? "Current name" : "Old name" } }));
    vi.mocked(chatService.conversations).mockImplementation(async (_token, cursor) => ({ items: page(cursor ? 20 : 0), nextCursor: cursor ? null : "page-two" }));
    await controller.refresh(); await controller.refresh(true);
    expect(controller.getSnapshot().conversations).toHaveLength(40);
    renamed = true; await controller.refresh();
    expect(controller.getSnapshot().conversations.every((item) => item.counterpart.displayName === "Current name")).toBe(true);
  });
  it("does not mark fetched history read until the selected thread has been presented in an active tab", async () => {
    await open();
    expect(chatService.read).not.toHaveBeenCalled();
    await controller.acknowledgeVisible("ab");
    expect(chatService.read).not.toHaveBeenCalled();
    controller.setActive(true);
    await controller.acknowledgeVisible("ab");
    expect(chatService.read).toHaveBeenCalledWith("ab", 1, "test-token");
    expect(controller.getSnapshot().conversations[0].unreadCount).toBe(0);
  });
  it("acknowledges the initial snapshot boundary including messages outside the latest 50", async () => {
    vi.mocked(chatService.history).mockImplementation(async (_id, _token, bounds) => ({ items: bounds?.afterSequence !== undefined ? [] : [message(51), message(100)], boundarySequence: 100, lastReadSequence: 0, hasMore: false }));
    await open(); controller.setActive(true);
    await controller.acknowledgeVisible("ab");
    expect(chatService.read).toHaveBeenCalledWith("ab", 100, "test-token");
  });
  it("does not advance read state for a hidden or unselected thread", async () => {
    await open(); controller.setActive(false);
    controller.receive({ type: "message.created", message: message(2) });
    await controller.acknowledgeVisible("ab");
    controller.setActive(true); controller.select(undefined);
    await controller.acknowledgeVisible("ab");
    expect(chatService.read).not.toHaveBeenCalled();
  });
  it("keeps reads monotonic across out-of-order updates from the reader's other tabs", async () => {
    await open();
    controller.receive({ type: "unread.updated", conversationId: "ab", lastReadSequence: 1, boundarySequence: 1, unreadCount: 0 });
    controller.receive({ type: "unread.updated", conversationId: "ab", lastReadSequence: 0, boundarySequence: 1, unreadCount: 1 });
    expect(controller.getSnapshot().threads.ab.lastRead).toBe(1);
    expect(controller.getSnapshot().conversations[0].unreadCount).toBe(0);
  });
  it("retains persisted unread state after a failed read and retries explicitly", async () => {
    await open(); controller.setActive(true);
    vi.mocked(chatService.read).mockRejectedValueOnce(new Error("offline"));
    await controller.acknowledgeVisible("ab");
    expect(controller.getSnapshot().conversations[0].unreadCount).toBe(1);
    await controller.acknowledgeVisible("ab");
    expect(chatService.read).toHaveBeenCalledTimes(1);
    controller.retryRead("ab"); await controller.acknowledgeVisible("ab");
    expect(controller.getSnapshot().conversations[0].unreadCount).toBe(0);
  });
  it("deduplicates accepted/live frames and recovers a gap before presenting later messages", async () => {
    await open();
    vi.mocked(chatService.history).mockResolvedValueOnce({ items: [message(2), message(3)], boundarySequence: 3, lastReadSequence: 0, hasMore: false });
    controller.receive({ type: "message.created", message: message(3) });
    expect(controller.getSnapshot().threads.ab.messages.map((item) => item.sequence)).toEqual([1]);
    await vi.waitFor(() => expect(controller.getSnapshot().threads.ab.boundary).toBe(3));
    controller.receive({ type: "message.accepted", requestId: "r", message: message(3) });
    controller.receive({ type: "message.created", message: message(2) });
    expect(controller.getSnapshot().threads.ab.messages.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });
  it("paginates catch-up on sync.required even if the socket never closed", async () => {
    await open();
    vi.mocked(chatService.history)
      .mockResolvedValueOnce({ items: [message(2)], boundarySequence: 3, lastReadSequence: 0, hasMore: true })
      .mockResolvedValueOnce({ items: [message(3)], boundarySequence: 3, lastReadSequence: 0, hasMore: false });
    controller.receive({ type: "sync.required", reason: "broker subscription recovered" });
    await vi.waitFor(() => expect(controller.getSnapshot().threads.ab.messages).toHaveLength(3));
    expect(chatService.history).toHaveBeenLastCalledWith("ab", "test-token", { afterSequence: 2 });
  });
  it("discards requests from a stopped lifecycle and reloads after StrictMode remount", async () => {
    controller.select("ab"); controller.stop(); controller.start(); controller.select("ab");
    await vi.waitFor(() => expect(controller.getSnapshot().threads.ab.loaded).toBe(true));
    expect(controller.getSnapshot().threads.ab.messages).toHaveLength(1);
  });
});

describe("Uncertain sends and block management", () => {
  it("preserves retry identity/text after uncertainty and never automatically resends", async () => {
    await open(); send.mockRejectedValue(new ApiRequestError(0, "Not confirmed", { code: "SEND_UNCERTAIN" }));
    controller.send("ab", "  Hello  B\n😀  ");
    await vi.waitFor(() => expect(controller.getSnapshot().drafts[0].status).toBe("failed"));
    const draft = controller.getSnapshot().drafts[0];
    controller.receive({ type: "sync.required", reason: "reconnect" });
    expect(send).toHaveBeenCalledTimes(1);
    controller.retry(draft);
    expect(send).toHaveBeenLastCalledWith("ab", draft.clientMessageId, "  Hello  B\n😀  ");
  });
  it("removes an optimistic failure when history proves that it was accepted", async () => {
    await open(); send.mockRejectedValue(new Error("lost reply"));
    controller.send("ab", "Hello");
    await vi.waitFor(() => expect(controller.getSnapshot().drafts[0].status).toBe("failed"));
    const draft = controller.getSnapshot().drafts[0];
    vi.mocked(chatService.history).mockResolvedValueOnce({ items: [message(2, { senderUserId: "alice", clientMessageId: draft.clientMessageId, text: "Hello" })], boundarySequence: 2, lastReadSequence: 0, hasMore: false });
    await controller.recover("ab");
    expect(controller.getSnapshot().drafts).toEqual([]);
    expect(controller.getSnapshot().threads.ab.messages).toHaveLength(2);
  });
  it("keeps the other party's block effective after the caller unblocks", async () => {
    await open();
    vi.mocked(chatService.conversations).mockResolvedValue({ items: [{ ...summary, blocked: true, messagingAvailable: false }], nextCursor: null });
    vi.spyOn(chatService, "block").mockResolvedValue({ userId: "bob", blockedByMe: false, messagingBlocked: true });
    await controller.block("bob", false);
    expect(controller.getSnapshot().conversations[0].messagingAvailable).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
