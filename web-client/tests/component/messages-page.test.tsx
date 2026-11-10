import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatService, type ChatMessage, type Conversation } from "../../src/api/chat-service";
import { userService } from "../../src/api/user-service";
import { MessagesPage } from "../../src/pages/messages-page";

const auth = vi.hoisted(() => ({ user: { userId: "alice", username: "alice", email: "alice@u.nus.edu", displayName: "Alice", systemRole: "USER" as const, accountStatus: "ACTIVE" as const }, withCurrentAccess: vi.fn() }));
vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));
let focused: boolean;
let summary: Conversation;
let sockets: Socket[];
const message = (sequence: number): ChatMessage => ({ conversationId: "ab", messageId: `m${sequence}`, senderUserId: "bob", clientMessageId: `c${sequence}`, sequence, text: `Message ${sequence}`, createdAt: "2026-10-21T01:00:00Z" });
class Socket {
  static OPEN = 1;
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
  send(raw: string) { if (JSON.parse(raw).type === "authenticate") queueMicrotask(() => this.emit({ type: "ready", userId: "alice" })); }
  emit(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
beforeEach(() => {
  sockets = []; focused = false;
  summary = { conversationId: "ab", counterpart: { userId: "bob", displayName: "Bob", username: "bob", accountStatus: "ACTIVE" }, createdAt: "2026-10-21T00:00:00Z", latestMessage: message(55), lastSequence: 55, lastReadSequence: 0, unreadCount: 55, blocked: false, messagingAvailable: true };
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  auth.withCurrentAccess.mockImplementation((operation: (token: string) => Promise<unknown>) => operation("test-token"));
  vi.spyOn(userService, "getCurrentUser").mockResolvedValue(auth.user);
  vi.spyOn(chatService, "conversations").mockImplementation(async () => ({ items: [{ ...summary }], nextCursor: null }));
  vi.spyOn(chatService, "conversation").mockImplementation(async () => ({ ...summary }));
  vi.spyOn(chatService, "blocks").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(chatService, "history").mockImplementation(async (_id, _token, bounds) => ({ items: bounds?.afterSequence !== undefined ? [] : [message(55)], boundarySequence: summary.lastSequence, lastReadSequence: summary.lastReadSequence, hasMore: false }));
  vi.spyOn(chatService, "read").mockImplementation(async (conversationId, upToSequence) => { summary = { ...summary, lastReadSequence: upToSequence, unreadCount: 0 }; return { conversationId, lastReadSequence: upToSequence, unreadCount: 0, boundarySequence: summary.lastSequence }; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => { render(<MemoryRouter initialEntries={["/messages/ab"]}><Routes><Route path="/messages/:conversationId?" element={<MessagesPage />} /></Routes></MemoryRouter>); });
  await screen.findByRole("textbox", { name: /^Message$/ });
  await waitFor(() => expect(screen.getByRole("textbox", { name: /^Message$/ })).toBeEnabled());
}
it("acknowledges the full presented snapshot only after the tab becomes focused", async () => {
  await mount(); expect(chatService.read).not.toHaveBeenCalled();
  expect(screen.getByLabelText("55 unread messages")).toBeVisible();
  focused = true; await act(async () => { fireEvent.focus(window); });
  await waitFor(() => expect(chatService.read).toHaveBeenCalledWith("ab", 55, "test-token"));
  expect(screen.queryByLabelText("55 unread messages")).toBeNull();
});
it("does not automatically read incoming messages after blur or while hidden", async () => {
  focused = true; await mount(); await waitFor(() => expect(chatService.read).toHaveBeenCalled());
  vi.mocked(chatService.read).mockClear();
  focused = false; await act(async () => { fireEvent.blur(window); });
  summary = { ...summary, lastSequence: 56, latestMessage: message(56), unreadCount: 1 };
  await act(async () => { sockets.at(-1)!.emit({ type: "message.created", message: message(56) }); });
  expect(chatService.read).not.toHaveBeenCalled();
  expect(screen.getByLabelText("1 unread messages")).toBeVisible();
  focused = true; vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => { fireEvent(document, new Event("visibilitychange")); });
  expect(chatService.read).not.toHaveBeenCalled();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => { fireEvent(document, new Event("visibilitychange")); });
  await waitFor(() => expect(chatService.read).toHaveBeenCalledWith("ab", 56, "test-token"));
});
