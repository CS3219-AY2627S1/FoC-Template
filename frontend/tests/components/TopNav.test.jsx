/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for TopNav.jsx, created for instructions.md Stage 22's "Nav bar (logged in)" and
 *        "Nav bar (logged out)" rows.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e - asserted the new "Audit log" admin link shows for an admin and not for a
 *        non-admin.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-08, Codex, model: GPT-6): Added or tested a total unread badge on the top chat icon.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Moved or tested live unread counts on the floating chat shortcut and removed the top shortcut.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added or verified a brief new-message chat shortcut animation with reduced-motion support.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Fixed the chat animation to react directly to incoming messages and move the entire shortcut.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Verified the stored chat title appears above the notification message.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Verified user-message sender headings and title-only system notifications.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Tested open-conversation notification suppression and delivery from other chats.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import TopNav from "../../src/components/TopNav";
import ChatBubble from "../../src/components/ChatBubble";
import { ToastProvider } from "../../src/components/Toast";

const chat = vi.hoisted(() => ({
  getChat: vi.fn().mockResolvedValue({ title: "Potato chips" }),
  listChats: vi.fn().mockResolvedValue({ conversations: [], hasMore: false }),
}));
vi.mock("../../src/api/chat", () => chat);
vi.mock("../../src/api/lookups", () => ({
  useUserName: (id) => (id ? "Courier Alice" : null),
}));
const realtime = vi.hoisted(() => ({ message: null }));
vi.mock("../../src/realtime/chatSocket", () => ({
  useChatMessages: (handler) => {
    realtime.message = handler;
  },
  useChatReady: () => {},
}));
const mockUseAuth = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const NO_CREDITS = { available: 0, reserved: 0, total: 0 };

function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/suppliers"]}>
      <ToastProvider>
        <TopNav />
      </ToastProvider>
    </MemoryRouter>,
  );
}

// TopNav renders each nav link twice (desktop <nav> + mobile drawer), so assertions use
// getAllByRole / queryAllByRole rather than requiring a single match.
describe("TopNav", () => {
  it("requester view: shows Suppliers and My errands, not Find errands or My deliveries", () => {
    mockUseAuth.mockReturnValue({
      isLoggedIn: true,
      user: { username: "alice", activeView: "requester" },
      credits: NO_CREDITS,
      requireAuth: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
    });
    renderNav();

    expect(
      screen.getAllByRole("link", { name: "Suppliers" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "My errands" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: "Find errands" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My deliveries" }),
    ).not.toBeInTheDocument();
  });

  it("courier view: shows Find errands and My deliveries, not Suppliers or My errands", () => {
    mockUseAuth.mockReturnValue({
      isLoggedIn: true,
      user: { username: "bob", activeView: "courier" },
      credits: NO_CREDITS,
      requireAuth: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
    });
    renderNav();

    expect(
      screen.getAllByRole("link", { name: "Find errands" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "My deliveries" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: "Suppliers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My errands" }),
    ).not.toBeInTheDocument();
  });

  it("shows the admin links alongside the current view's links for an admin", () => {
    mockUseAuth.mockReturnValue({
      isLoggedIn: true,
      user: { username: "admin", activeView: "requester" },
      credits: NO_CREDITS,
      requireAuth: vi.fn(),
      logout: vi.fn(),
      isAdmin: true,
    });
    renderNav();

    expect(
      screen.getAllByRole("link", { name: "Suppliers" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Manage suppliers" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Manage users" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Audit log" }).length,
    ).toBeGreaterThan(0);
  });

  it('does not show "Audit log" for a non-admin', () => {
    mockUseAuth.mockReturnValue({
      isLoggedIn: true,
      user: { username: "alice", activeView: "requester" },
      credits: NO_CREDITS,
      requireAuth: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
    });
    renderNav();

    expect(
      screen.queryByRole("link", { name: "Audit log" }),
    ).not.toBeInTheDocument();
  });

  it("logged out: no page links, only Log in and Register", () => {
    mockUseAuth.mockReturnValue({
      isLoggedIn: false,
      user: null,
      credits: NO_CREDITS,
      requireAuth: vi.fn(),
      logout: vi.fn(),
      isAdmin: false,
    });
    renderNav();

    for (const label of [
      "Suppliers",
      "Find errands",
      "My errands",
      "My deliveries",
    ]) {
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("button", { name: "Log in" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Register" }).length,
    ).toBeGreaterThan(0);
  });
});

it("sums unread counts on the floating shortcut while the top nav has no chat link", async () => {
  mockUseAuth.mockReturnValue({
    isLoggedIn: true,
    user: { id: "me", username: "alice", activeView: "requester" },
    credits: NO_CREDITS,
  });
  chat.listChats
    .mockResolvedValueOnce({
      conversations: [{ unreadCount: 2 }],
      hasMore: true,
      nextCursor: { id: "next" },
    })
    .mockResolvedValueOnce({
      conversations: [{ unreadCount: 3 }, { unreadCount: 0 }],
      hasMore: false,
    });
  renderNav();
  expect(
    screen.queryByRole("link", { name: /^Chats/ }),
  ).not.toBeInTheDocument();
  render(
    <MemoryRouter initialEntries={["/suppliers"]}>
      <ToastProvider>
        <ChatBubble />
      </ToastProvider>
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("link", { name: "Messages, 5 unread" }),
  ).toHaveTextContent("5");
  expect(chat.listChats).toHaveBeenCalledWith("requester", { id: "next" });
});

it("wiggles the entire shortcut immediately for incoming messages and restarts for the next one", async () => {
  mockUseAuth.mockReturnValue({
    isLoggedIn: true,
    user: { id: "me", username: "alice", activeView: "requester" },
    credits: NO_CREDITS,
  });
  chat.listChats.mockResolvedValue({
    conversations: [{ unreadCount: 1 }],
    hasMore: false,
  });
  render(
    <MemoryRouter>
      <ToastProvider>
        <ChatBubble />
      </ToastProvider>
    </MemoryRouter>,
  );
  const original = await screen.findByRole("link", {
    name: "Messages, 1 unread",
  });
  expect(original).not.toHaveClass("chat-new-message");
  act(() => realtime.message({ messageId: "own", senderId: "me" }));
  expect(original).not.toHaveClass("chat-new-message");
  act(() => realtime.message({ messageId: "new-1", senderId: "other" }));
  const animated = screen.getByRole("link", { name: "Messages, 1 unread" });
  expect(animated).toHaveClass("chat-new-message");
  act(() => realtime.message({ messageId: "new-1", senderId: "other" }));
  expect(screen.getByRole("link", { name: "Messages, 1 unread" })).toBe(
    animated,
  );
  act(() => realtime.message({ messageId: "new-2", senderId: "other" }));
  expect(screen.getByRole("link", { name: "Messages, 1 unread" })).not.toBe(
    animated,
  );
  await waitFor(() => expect(chat.listChats).toHaveBeenCalled());
});

// AI-generated
it("shows incoming message toasts but suppresses own messages and own order actions", async () => {
  mockUseAuth.mockReturnValue({
    isLoggedIn: true,
    user: { id: "me", activeView: "requester" },
  });
  chat.listChats.mockResolvedValue({ conversations: [], hasMore: false });
  render(
    <MemoryRouter initialEntries={["/chat/current"]}>
      <ToastProvider>
        <ChatBubble />
      </ToastProvider>
    </MemoryRouter>,
  );
  act(() =>
    realtime.message({
      messageId: "own-text",
      senderId: "me",
      content: "My text",
    }),
  );
  act(() =>
    realtime.message({
      messageId: "own-action",
      senderId: null,
      triggeredByUserId: "me",
      content: "Created",
    }),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  const incoming = {
    conversationId: "order-chat",
    messageId: "accepted",
    senderId: null,
    triggeredByUserId: "courier",
    content: "Accepted by courier",
  };
  act(() => realtime.message(incoming));
  act(() => realtime.message(incoming));
  await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(1));
  expect(screen.getByRole("status")).toHaveTextContent("Accepted by courier");
  expect(screen.getByRole("status")).toHaveTextContent("Potato chips");
  expect(screen.getByText("Potato chips")).toHaveClass(
    "block",
    "font-semibold",
  );
  expect(chat.getChat).toHaveBeenCalledWith("order-chat");
  expect(screen.getByRole("status")).not.toHaveTextContent("Courier Alice");
  act(() =>
    realtime.message({
      messageId: "text",
      type: "TEXT",
      senderId: "courier",
      content: "Hello",
    }),
  );
  await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(2));
  expect(screen.getByText("Courier Alice · Potato chips")).toHaveClass(
    "font-semibold",
  );
});

// AI-generated
it("suppresses messages from the open chat but still notifies for other conversations", async () => {
  mockUseAuth.mockReturnValue({
    isLoggedIn: true,
    user: { id: "me", activeView: "requester" },
  });
  chat.listChats.mockResolvedValue({ conversations: [], hasMore: false });
  render(
    <MemoryRouter initialEntries={["/chat/current"]}>
      <ToastProvider>
        <ChatBubble />
      </ToastProvider>
    </MemoryRouter>,
  );
  act(() =>
    realtime.message({
      conversationId: "current",
      messageId: "open-text",
      senderId: "other",
      type: "TEXT",
      content: "Already reading",
    }),
  );
  act(() =>
    realtime.message({
      conversationId: "current",
      messageId: "open-system",
      senderId: null,
      type: "SYSTEM",
      content: "Already displayed",
    }),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  act(() =>
    realtime.message({
      conversationId: "another-chat",
      messageId: "other-text",
      senderId: "other",
      type: "TEXT",
      content: "Another conversation",
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Another conversation",
  );
  expect(screen.queryByText("Already reading")).not.toBeInTheDocument();
  expect(screen.queryByText("Already displayed")).not.toBeInTheDocument();
});
