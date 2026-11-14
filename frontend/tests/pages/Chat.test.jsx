/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for Chat.jsx's mobile back arrow, created for instructions.md Stage 22's "Chat
 *        back arrow (mobile)" row: goes back to the previous in-app page, or to the current
 *        view's main page when there is none (opened directly by URL / new tab). Exercises the
 *        real routing/navigationHistory.js module (reset before each test) rather than mocking
 *        it, since that module's whole job is to distinguish the two cases.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Added live-chat API doubles and role/list/error tests.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added the requested /chats list with titles, previews and conversation navigation.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Verified message submission and added send-button feedback and regression tests.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Tested realtime message merging and room lifecycle wiring.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or verified marking displayed chat messages as read.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Updated or tested chat bubbles, navigation and live read indicators.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Fixed receipt sizing and added centered dates with minute-only message times.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified participant read positions in message history.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Displayed or tested the opposite participant's name beside the chat order title.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Reordered chat titles and formatted list timestamps per the user's rules.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested initial bottom scrolling and message-input refocus after sending.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Opened chats at the first unread message when outside the bottom viewport.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Scrolled or tested scrolling to the bottom after successful message sending.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Verified that pending sends do not show the loading label.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Automatically loaded older messages on top scrolling while preserving the viewport.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested errand-origin-only outer chat back navigation.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Tested pinned system chats, FoC message labels and read-only sending.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Tested the Auto-translate switch, translated display and Show original/Translate controls.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Codex, model: GPT-6): Tested translation control above the timestamp.
 * Author review:
 * Scope (2026-11-09, Codex, model: GPT-6): Tested message metadata placement.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested requested active/archived chat list tabs using the existing status filter.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Restored the pinned system chat independently of the selected status tab.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Restricted system chat to the Active list per user correction.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Verified bottom-aware new-message scrolling and arrow navigation.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Tested paginated tab unread counts, system-chat placement and refresh after read updates.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Updated unread badge tests to verify zero-count badges are absent.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Combined existing translation and chat branch changes during merge resolution.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Updated pagination tests to trigger bottom intersection.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: removed the DemoProvider wrapper (the demo is gone, all services are live).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Chat from "../../src/pages/Chat";

const realtime = vi.hoisted(() => ({
  handlers: [],
  reads: [],
  ready: [],
  translated: [],
  useChatRoom: vi.fn(),
}));
vi.mock("../../src/realtime/chatSocket", () => ({
  useChatRoom: (...args) => realtime.useChatRoom(...args),
  useChatMessages: (handler) => {
    realtime.handlers.push(handler);
  },
  useChatReads: (handler) => {
    realtime.reads.push(handler);
  },
  useChatReady: (handler) => {
    realtime.ready.push(handler);
  },
  useChatTranslations: (handler) => {
    realtime.translated.push(handler);
  },
}));
const chatApi = vi.hoisted(() => ({
  markMessagesRead: vi.fn(),
  listChats: vi.fn(),
  getChat: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  findOrderChat: vi.fn(),
  setTranslation: vi.fn(),
}));
vi.mock("../../src/api/chat", () => chatApi);
const profileApi = vi.hoisted(() => ({ getProfile: vi.fn() }));
vi.mock("../../src/api/profile", () => profileApi);
vi.mock("../../src/api/lookups", () => ({
  useUserName: (id) =>
    ({ "courier-id": "Courier Alice", "requester-id": "Requester Bob" })[id] ??
    null,
}));
const mockUseAuth = vi.fn();
vi.mock("../../src/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderChat(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chats" element={<Chat />} />
        <Route path="/my-errands" element={<p>Errand cards</p>} />
        <Route path="/my-deliveries" element={<p>Delivery cards</p>} />
        <Route path="/suppliers" element={<p>Suppliers page</p>} />
        <Route path="/requests" element={<p>Find errands page</p>} />
        <Route path="/some-other-page" element={<p>The previous page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

let chatListObserver;

// AI-generated
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback) { this.callback = callback; }
    observe() { chatListObserver = this; }
    disconnect() {}
  });
  chatListObserver = undefined;
  chatApi.markMessagesRead.mockResolvedValue({});
  chatApi.listChats.mockResolvedValue({
    conversations: [],
    nextCursor: null,
    hasMore: false,
  });
  chatApi.getChat.mockResolvedValue({ title: "Errand chat", status: "ACTIVE" });
  chatApi.listMessages.mockResolvedValue({
    data: [],
    pagination: { hasMore: false, nextCursor: null },
  });
  realtime.handlers = [];
  realtime.reads = [];
  realtime.ready = [];
  realtime.translated = [];
  profileApi.getProfile.mockResolvedValue({ preferredLang: "es" });
  mockUseAuth.mockReturnValue({ user: { activeView: "requester" } });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Chat outer back arrow", () => {
  it("is hidden when opened directly or from the chat icon", async () => {
    renderChat(["/chat/r6"]);
    await screen.findByText("Errand chat");
    expect(
      screen.queryByRole("button", { name: "Go back" }),
    ).not.toBeInTheDocument();
  });
  it.each([
    ["/my-errands", "Errand cards"],
    ["/my-deliveries", "Delivery cards"],
  ])(
    "returns explicitly to %s for an errand-origin chat",
    async (returnTo, label) => {
      renderChat([
        { pathname: "/chat/r6", state: { errandReturnTo: returnTo } },
      ]);
      await screen.findByText("Errand chat");
      fireEvent.click(screen.getByRole("button", { name: "Go back" }));
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );
  it("preserves errand origin through order-to-chat resolution", async () => {
    chatApi.findOrderChat.mockResolvedValue({ id: "conversation-1" });
    renderChat([
      {
        pathname: "/chat",
        search: "?orderId=order-1",
        state: { errandReturnTo: "/my-errands" },
      },
    ]);
    await screen.findByText("Errand chat");
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("Errand cards")).toBeInTheDocument();
  });
});

describe("Live chat list", () => {
  it("loads requester chats and shows the empty state", async () => {
    renderChat(["/chats"]);
    expect(
      await screen.findByText("No chats in requester mode."),
    ).toBeInTheDocument();
    expect(chatApi.listChats).toHaveBeenCalledWith(
      "requester",
      undefined,
      "active",
    );
  });

  it("filters the HTTP call by courier mode and opens the conversation ID", async () => {
    mockUseAuth.mockReturnValue({ user: { activeView: "courier" } });
    chatApi.listChats.mockResolvedValue({
      conversations: [
        {
          id: "conversation-1",
          orderId: "order-1",
          updatedAt: "2026-11-08T00:00:00Z",
          lastMessage: null,
          unreadCount: 2,
        },
      ],
      hasMore: false,
    });
    renderChat(["/chats"]);
    const link = await screen.findByRole("link", { name: /Errand chat/ });
    expect(link).toHaveAttribute("href", "/chat/conversation-1");
    expect(chatApi.listChats).toHaveBeenCalledWith(
      "courier",
      undefined,
      "active",
    );
    expect(screen.getByLabelText("2 unread messages")).toHaveTextContent("2");
  });

  it("shows a failed list request and allows retry", async () => {
    chatApi.listChats.mockRejectedValueOnce(
      new Error("Chat service unavailable"),
    );
    renderChat(["/chats"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chat service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No chats in requester mode."),
    ).toBeInTheDocument();
  });

  it("resolves an order ID to its conversation before opening", async () => {
    chatApi.findOrderChat.mockResolvedValue({ id: "conversation-1" });
    renderChat(["/chat?orderId=order-1"]);
    expect(await screen.findByText("Errand chat")).toBeInTheDocument();
    expect(chatApi.findOrderChat).toHaveBeenCalledWith("order-1", "requester");
    expect(chatApi.getChat).toHaveBeenCalledWith("conversation-1");
  });
});

it("shows titles and previews in server update order, then opens messages on click", async () => {
  chatApi.listChats.mockResolvedValue({
    conversations: [
      {
        id: "new-chat",
        orderId: "order-new",
        updatedAt: "2026-11-08T12:00:00Z",
        lastMessage: { content: "Newest preview" },
        unreadCount: 0,
      },
      {
        id: "old-chat",
        orderId: "order-old",
        updatedAt: "2026-11-07T12:00:00Z",
        lastMessage: { content: "Older preview" },
        unreadCount: 0,
      },
    ],
    hasMore: false,
  });
  chatApi.getChat.mockImplementation(async (id) => ({
    title: id === "new-chat" ? "Coffee errand" : "Lunch errand",
    status: "ACTIVE",
  }));
  chatApi.listMessages.mockResolvedValue({
    data: [
      {
        messageId: "m-1",
        senderId: "another-user",
        type: "TEXT",
        content: "Your coffee is ready",
        createdAt: "2026-11-08T12:00:00Z",
      },
    ],
    pagination: { hasMore: false },
  });
  renderChat(["/chats"]);
  const newest = await screen.findByRole("link", { name: /Coffee errand/ });
  const older = screen.getByRole("link", { name: /Lunch errand/ });
  expect(
    newest.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText("Newest preview")).toBeInTheDocument();
  fireEvent.click(newest);
  expect(await screen.findByText("Your coffee is ready")).toBeInTheDocument();
  expect(chatApi.listMessages).toHaveBeenCalledWith("new-chat");
});

it("sends the draft to the selected conversation and displays the saved message", async () => {
  chatApi.sendMessage.mockResolvedValue({
    messageId: "sent-1",
    senderId: "me",
    type: "TEXT",
    content: "Hello courier",
    createdAt: "2026-11-08T12:00:00Z",
  });
  renderChat(["/chat/conversation-1"]);
  const input = screen.getByRole("textbox", { name: "Message" });
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "Hello courier" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByText("Hello courier")).toBeInTheDocument();
  expect(chatApi.sendMessage).toHaveBeenCalledWith(
    "conversation-1",
    "Hello courier",
  );
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
});

it("retains the draft and shows an error when the endpoint rejects sending", async () => {
  chatApi.sendMessage.mockRejectedValue(new Error("Message could not be sent"));
  renderChat(["/chat/conversation-1"]);
  const input = screen.getByRole("textbox", { name: "Message" });
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Message could not be sent",
  );
  expect(input).toHaveValue("Keep this draft");
  expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
});

it("renders incoming socket messages once and ignores other conversations", async () => {
  renderChat(["/chat/conversation-1"]);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled(),
  );
  expect(realtime.useChatRoom).toHaveBeenCalledWith(
    "conversation-1",
    expect.any(Function),
  );
  const message = {
    messageId: "live-1",
    conversationId: "conversation-1",
    senderId: "other",
    type: "TEXT",
    content: "Arrived live",
    createdAt: "2026-11-08T12:00:00Z",
  };
  await act(async () => {
    realtime.handlers.forEach((handler) => {
      handler(message);
      handler(message);
      handler({
        ...message,
        conversationId: "different",
        messageId: "other",
        content: "Wrong room",
      });
    });
  });
  expect(screen.getAllByText("Arrived live")).toHaveLength(1);
  expect(screen.queryByText("Wrong room")).not.toBeInTheDocument();
});

it("marks the newest displayed message as read on opening and on realtime delivery", async () => {
  chatApi.listMessages.mockResolvedValue({
    data: [
      {
        messageId: "newest",
        content: "Newest",
        createdAt: "2026-11-08T12:00:00Z",
      },
      {
        messageId: "older",
        content: "Older",
        createdAt: "2026-11-08T11:00:00Z",
      },
    ],
    pagination: { hasMore: false },
  });
  renderChat(["/chat/conversation-1"]);
  await waitFor(() =>
    expect(chatApi.markMessagesRead).toHaveBeenCalledWith(
      "conversation-1",
      "newest",
    ),
  );
  await act(async () =>
    realtime.handlers.forEach((handler) =>
      handler({
        conversationId: "conversation-1",
        messageId: "live",
        content: "Live",
        createdAt: "2026-11-08T13:00:00Z",
      }),
    ),
  );
  await waitFor(() =>
    expect(chatApi.markMessagesRead).toHaveBeenLastCalledWith(
      "conversation-1",
      "live",
    ),
  );
});

it("does not send a read receipt for an empty conversation", async () => {
  renderChat(["/chat/conversation-1"]);
  await screen.findByText("Errand chat");
  expect(chatApi.markMessagesRead).not.toHaveBeenCalled();
});

it("keeps messages displayed and shows a read failure", async () => {
  chatApi.markMessagesRead.mockRejectedValueOnce(
    new Error("Could not mark messages read"),
  );
  chatApi.listMessages.mockResolvedValue({
    data: [
      {
        messageId: "m1",
        content: "Still visible",
        createdAt: "2026-11-08T12:00:00Z",
      },
    ],
    pagination: { hasMore: false },
  });
  renderChat(["/chat/conversation-1"]);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not mark messages read",
  );
  expect(screen.getByText("Still visible")).toBeInTheDocument();
});

it("shows sent ticks, then read ticks for the other participant receipt", async () => {
  mockUseAuth.mockReturnValue({ user: { id: "me", activeView: "requester" } });
  chatApi.listMessages.mockResolvedValue({
    data: [
      {
        messageId: "sent",
        senderId: "me",
        content: "Sent message",
        createdAt: "2026-11-08T12:00:00Z",
      },
      {
        messageId: "later",
        senderId: "me",
        content: "Later message",
        createdAt: "2026-11-08T13:00:00Z",
      },
    ],
    pagination: { hasMore: false },
  });
  renderChat(["/chat/conversation-1"]);
  await screen.findByText("Sent message");
  expect(screen.getAllByRole("img", { name: "Sent" })).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: "Refresh messages" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to chats" })).toHaveAttribute(
    "href",
    "/chats",
  );
  await act(async () =>
    realtime.reads.forEach((handler) => {
      handler({
        conversationId: "wrong",
        userId: "other",
        lastReadMessageId: "later",
      });
      handler({
        conversationId: "conversation-1",
        userId: "me",
        lastReadMessageId: "later",
      });
    }),
  );
  expect(screen.queryByRole("img", { name: "Read" })).not.toBeInTheDocument();
  await act(async () =>
    realtime.reads.forEach((handler) =>
      handler({
        conversationId: "conversation-1",
        userId: "other",
        lastReadMessageId: "sent",
      }),
    ),
  );
  expect(screen.getAllByRole("img", { name: "Read" })).toHaveLength(1);
  expect(screen.getAllByRole("img", { name: "Sent" })).toHaveLength(1);
});

it("groups messages by local date and shows hours and minutes without seconds", async () => {
  const first = new Date(2026, 10, 8, 21, 35, 29);
  const sameDay = new Date(2026, 10, 8, 21, 36, 45);
  const nextDay = new Date(2026, 10, 9, 9, 5, 12);
  chatApi.listMessages.mockResolvedValue({
    data: [first, sameDay, nextDay].map((date, index) => ({
      messageId: `dated-${index}`,
      senderId: "other",
      content: `Dated message ${index}`,
      createdAt: date.toISOString(),
    })),
    pagination: { hasMore: false },
  });
  const { container } = renderChat(["/chat/conversation-1"]);
  await screen.findByText("Dated message 2");
  const dates = [...container.querySelectorAll("ol time")].map(
    (element) => element.textContent,
  );
  expect(dates).toEqual([
    first.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    "21:35",
    "21:36",
    nextDay.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    "09:05",
  ]);
});

it("restores read ticks from participant positions after opening again", async () => {
  mockUseAuth.mockReturnValue({ user: { id: "me", activeView: "requester" } });
  chatApi.listMessages.mockResolvedValue({
    data: [
      {
        messageId: "read",
        senderId: "me",
        content: "Previously read",
        createdAt: "2026-11-08T12:00:00Z",
      },
      {
        messageId: "unread",
        senderId: "me",
        content: "Not read",
        createdAt: "2026-11-08T13:00:00Z",
      },
    ],
    participants: [
      {
        userId: "me",
        role: "REQUESTER",
        joinedAt: "2026-11-08T00:00:00Z",
        lastReadMessageId: "unread",
      },
      {
        userId: "other",
        role: "COURIER",
        joinedAt: "2026-11-08T00:00:00Z",
        lastReadMessageId: "read",
      },
    ],
    pagination: { hasMore: false },
  });
  const first = renderChat(["/chat/conversation-1"]);
  await screen.findByText("Previously read");
  expect(screen.getAllByRole("img", { name: "Read" })).toHaveLength(1);
  expect(screen.getAllByRole("img", { name: "Sent" })).toHaveLength(1);
  first.unmount();
  renderChat(["/chat/conversation-1"]);
  await screen.findByText("Previously read");
  expect(screen.getAllByRole("img", { name: "Read" })).toHaveLength(1);
  expect(screen.getAllByRole("img", { name: "Sent" })).toHaveLength(1);
});

it.each([
  ["requester", "Courier Alice"],
  ["courier", "Requester Bob"],
])(
  "shows the other participant name in %s view in the list and thread",
  async (role, name) => {
    mockUseAuth.mockReturnValue({ user: { id: "me", activeView: role } });
    chatApi.listChats.mockResolvedValue({
      conversations: [{ id: "conversation-1", unreadCount: 0 }],
      hasMore: false,
    });
    chatApi.getChat.mockResolvedValue({
      title: "Coffee order",
      status: "ACTIVE",
      participants: [
        { userId: "courier-id", role: "COURIER" },
        { userId: "requester-id", role: "REQUESTER" },
      ],
    });
    renderChat(["/chats"]);
    fireEvent.click(
      await screen.findByRole("link", {
        name: new RegExp(`${name} · Coffee order`),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: `${name} · Coffee order` }),
    ).toBeInTheDocument();
  },
);

it("formats list timestamps as time today, day/month this year, and year otherwise", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 8, 21, 50, 0));
  try {
    const dates = [
      new Date(2026, 10, 8, 9, 5, 32),
      new Date(2026, 0, 2, 12),
      new Date(2025, 10, 8, 12),
    ];
    chatApi.listChats.mockResolvedValue({
      conversations: dates.map((date, index) => ({
        id: `chat-${index}`,
        updatedAt: date.toISOString(),
        unreadCount: 0,
      })),
      hasMore: false,
    });
    const { container } = renderChat(["/chats"]);
    await screen.findAllByRole("link", { name: /Errand chat/ });
    expect(
      [...container.querySelectorAll("aside time")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["09:05", "02/01", "2025"]);
  } finally {
    vi.useRealTimers();
  }
});

it("scrolls to the bottom after initial history loads without jumping on older history", async () => {
  const height = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(1200);
  try {
    chatApi.listMessages
      .mockResolvedValueOnce({
        data: [
          {
            messageId: "latest",
            content: "Latest message",
            createdAt: "2026-11-08T12:00:00Z",
          },
        ],
        pagination: { hasMore: true, nextCursor: { id: "latest" } },
      })
      .mockResolvedValueOnce({
        data: [
          {
            messageId: "old",
            content: "Old message",
            createdAt: "2026-11-07T12:00:00Z",
          },
        ],
        pagination: { hasMore: false },
      });
    renderChat(["/chat/conversation-1"]);
    await screen.findByText("Latest message");
    const list = screen.getByText("Latest message").closest("ol");
    expect(list.scrollTop).toBe(1200);
    list.scrollTop = 0;
    fireEvent.scroll(list);
    await screen.findByText("Old message");
    expect(list.scrollTop).toBe(0);
  } finally {
    height.mockRestore();
  }
});

it("loads the saved read boundary and opens with the first unread at the top", async () => {
  mockUseAuth.mockReturnValue({ user: { id: "me", activeView: "requester" } });
  const height = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(1200);
  const viewport = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(300);
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function () {
      return { top: this.dataset.messageId === "first-unread" ? 200 : 0 };
    });
  try {
    const message = (id, hour, senderId = "other") => ({
      messageId: id,
      content: id,
      senderId,
      createdAt: `2026-11-08T${hour}:00:00Z`,
    });
    chatApi.listMessages
      .mockResolvedValueOnce({
        data: [message("latest", "14")],
        participants: [{ userId: "me", lastReadMessageId: "read" }],
        pagination: { hasMore: true, nextCursor: { id: "latest" } },
      })
      .mockResolvedValueOnce({
        data: [
          message("first-unread", "12"),
          message("my-message", "11", "me"),
          message("read", "10"),
        ],
        pagination: { hasMore: false },
      });
    renderChat(["/chat/conversation-1"]);
    await screen.findByText("first-unread");
    expect(chatApi.listMessages).toHaveBeenCalledWith("conversation-1", {
      id: "latest",
    });
    expect(screen.getByText("first-unread").closest("ol").scrollTop).toBe(200);
  } finally {
    height.mockRestore();
    viewport.mockRestore();
    rect.mockRestore();
  }
});

it("preserves an earlier reading position after sending and restores input focus", async () => {
  const height = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(1200);
  try {
    chatApi.sendMessage.mockResolvedValue({
      messageId: "sent-bottom",
      content: "New bottom message",
      senderId: "me",
      createdAt: "2026-11-08T15:00:00Z",
    });
    const { container } = renderChat(["/chat/conversation-1"]);
    const input = screen.getByRole("textbox", { name: "Message" });
    await waitFor(() => expect(input).toBeEnabled());
    const list = container.querySelector("ol");
    list.scrollTop = 20;
    fireEvent.scroll(list);
    fireEvent.change(input, { target: { value: "New bottom message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("New bottom message");
    expect(list.scrollTop).toBe(20);
    fireEvent.click(
      screen.getByRole("button", { name: "Scroll to new messages" }),
    );
    expect(list.scrollTop).toBe(1200);
    expect(input).toHaveFocus();
  } finally {
    height.mockRestore();
  }
});

it("does not show a loading label while a send is pending", async () => {
  let finishSend;
  chatApi.sendMessage.mockReturnValueOnce(
    new Promise((resolve) => {
      finishSend = resolve;
    }),
  );
  renderChat(["/chat/conversation-1"]);
  const input = screen.getByRole("textbox", { name: "Message" });
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "Seamless send" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  await act(async () =>
    finishSend({
      messageId: "seamless",
      content: "Seamless send",
      createdAt: "2026-11-08T12:00:00Z",
    }),
  );
  expect(await screen.findByText("Seamless send")).toBeInTheDocument();
  expect(input).toHaveFocus();
});

it("loads older history once at the top, preserving the viewport as content grows", async () => {
  let contentHeight = 1200;
  const height = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockImplementation(() => contentHeight);
  let resolveOlder;
  try {
    chatApi.listMessages
      .mockResolvedValueOnce({
        data: [
          {
            messageId: "recent",
            content: "Recent",
            createdAt: "2026-11-08T12:00:00Z",
          },
        ],
        pagination: { hasMore: true, nextCursor: { id: "recent" } },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      );
    renderChat(["/chat/conversation-1"]);
    const list = (await screen.findByText("Recent")).closest("ol");
    expect(
      screen.queryByRole("button", { name: "Load older messages" }),
    ).not.toBeInTheDocument();
    list.scrollTop = 50;
    fireEvent.scroll(list);
    expect(chatApi.listMessages).toHaveBeenCalledTimes(1);
    list.scrollTop = 0;
    fireEvent.scroll(list);
    fireEvent.scroll(list);
    expect(chatApi.listMessages).toHaveBeenCalledTimes(2);
    contentHeight = 1800;
    await act(async () =>
      resolveOlder({
        data: [
          {
            messageId: "earlier",
            content: "Earlier",
            createdAt: "2026-11-07T12:00:00Z",
          },
        ],
        pagination: { hasMore: false },
      }),
    );
    expect(list.scrollTop).toBe(600);
    list.scrollTop = 0;
    fireEvent.scroll(list);
    expect(chatApi.listMessages).toHaveBeenCalledTimes(2);
  } finally {
    height.mockRestore();
  }
});

// AI-generated
// AI-generated (edited by <name>).
describe("Chat translation", () => {
  const received = (extra = {}) => ({
    messageId: "m1",
    conversationId: "c1",
    senderId: "other",
    type: "TEXT",
    content: "Hello there",
    metadata: null,
    createdAt: "2026-11-09T00:00:00.000Z",
    translatedContent: null,
    ...extra,
  });
  const open = (messages, translateTo = null) => {
    mockUseAuth.mockReturnValue({
      user: { id: "me", activeView: "requester" },
    });
    chatApi.listMessages.mockResolvedValue({
      participants: [{ userId: "me", role: "REQUESTER", translateTo }],
      data: messages,
      pagination: { hasMore: false, nextCursor: null },
    });
    renderChat(["/chat/c1"]);
  };
  const toggle = () => screen.findByRole("switch", { name: "Auto-translate" });

  // AI-generated (edited by <name>).
  it("places translation above the received time outside the bubble", async () => {
    open(
      [
        received({ translatedContent: "Hola" }),
        received({ messageId: "mine", senderId: "me", content: "My message" }),
      ],
      "es",
    );
    const receivedText = await screen.findByText("Hola");
    const ownText = screen.getByText("My message");
    const receivedRow = receivedText.closest("li");
    const ownRow = ownText.closest("li");
    const receivedTime = receivedRow.querySelectorAll("time")[1];
    const ownTime = ownRow.querySelector("time");
    const control = screen.getByRole("button", { name: /Show original/ });
    expect(receivedText.parentElement).not.toContainElement(receivedTime);
    expect(ownText.parentElement).not.toContainElement(ownTime);
    expect(receivedText.parentElement).not.toContainElement(control);
    expect(
      control.compareDocumentPosition(receivedTime) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(ownTime.parentElement.parentElement).toHaveClass("justify-end");
  });

  it("shows the saved switch state and the translated text with Show original", async () => {
    open([received({ translatedContent: "Hola" })], "es");
    expect(await screen.findByText("Hola")).toBeInTheDocument();
    expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
    expect(await toggle()).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /Show original/ }));
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    expect(screen.getByText("Hola")).toBeInTheDocument();
  });

  it("shows originals when off but offers Translate without calling the model", async () => {
    open([received({ translatedContent: "Hola" })], null);
    expect(await screen.findByText("Hello there")).toBeInTheDocument();
    expect(await toggle()).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    expect(screen.getByText("Hola")).toBeInTheDocument();
    expect(chatApi.setTranslation).not.toHaveBeenCalled();
  });

  it("offers no control for untranslated, SAME and own messages", async () => {
    open(
      [
        received({ messageId: "a", content: "plain" }),
        received({
          messageId: "b",
          content: "same",
          translatedContent: "SAME",
        }),
        received({
          messageId: "c",
          senderId: "me",
          content: "mine",
          translatedContent: "x",
        }),
      ],
      "es",
    );
    expect(await screen.findByText("plain")).toBeInTheDocument();
    expect(screen.getByText("same")).toBeInTheDocument();
    expect(screen.getByText("mine")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Show original|Translate/ }),
    ).toBeNull();
  });

  it("turns translation on with the preferred language read at launch", async () => {
    chatApi.setTranslation.mockResolvedValue({ translateTo: "es" });
    open([received()]);
    const sw = await toggle();
    await waitFor(() => expect(sw).not.toBeDisabled());
    fireEvent.click(sw);
    await waitFor(() =>
      expect(chatApi.setTranslation).toHaveBeenCalledWith("c1", {
        enabled: true,
        language: "es",
      }),
    );
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  });

  it("turns translation off", async () => {
    chatApi.setTranslation.mockResolvedValue({ translateTo: null });
    open([received({ translatedContent: "Hola" })], "es");
    const sw = await toggle();
    fireEvent.click(sw);
    await waitFor(() =>
      expect(chatApi.setTranslation).toHaveBeenCalledWith("c1", {
        enabled: false,
      }),
    );
    expect(await screen.findByText("Hello there")).toBeInTheDocument();
  });

  it("applies a message:translated event to the open chat only", async () => {
    open([received()], "es");
    await screen.findByText("Hello there");
    act(() =>
      realtime.translated.forEach((h) =>
        h({
          messageId: "m1",
          conversationId: "other-chat",
          translatedContent: "No",
        }),
      ),
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    act(() =>
      realtime.translated.forEach((h) =>
        h({ messageId: "m1", conversationId: "c1", translatedContent: "Hola" }),
      ),
    );
    expect(await screen.findByText("Hola")).toBeInTheDocument();
  });

  it("shows a failed toggle and keeps the previous state", async () => {
    chatApi.setTranslation.mockRejectedValue(new Error("Could not update"));
    open([received()], "es");
    fireEvent.click(await toggle());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update",
    );
    expect(await toggle()).toHaveAttribute("aria-checked", "true");
  });
});

// AI-generated (edited by <name>).
it("disables the composer for FoC system conversations", async () => {
  chatApi.getChat.mockResolvedValue({
    title: "FoC",
    status: "ACTIVE",
    orderId: null,
  });
  renderChat(["/chat/conversation-1"]);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled(),
  );
  expect(chatApi.sendMessage).not.toHaveBeenCalled();
});

// AI-generated
it("pins an older FoC conversation found beyond the first page without duplicating it", async () => {
  const order = {
    id: "order-chat",
    orderId: "order-1",
    updatedAt: "2026-11-09T12:00:00Z",
  };
  const system = {
    id: "system-chat",
    orderId: null,
    updatedAt: "2026-11-01T12:00:00Z",
  };
  const cursor = { id: "order-chat", updatedAt: order.updatedAt };
  chatApi.listChats.mockImplementation(async (_role, next) =>
    next
      ? { conversations: [system], hasMore: false, nextCursor: null }
      : { conversations: [order], hasMore: true, nextCursor: cursor },
  );
  chatApi.getChat.mockImplementation(async (id) => ({
    title: id === "system-chat" ? "FoC" : "Errand chat",
    status: "ACTIVE",
  }));
  renderChat(["/chats"]);
  const systemLink = await screen.findByRole("link", { name: /FoC/ });
  const orderLink = screen.getByRole("link", { name: /Errand chat/ });
  expect(
    systemLink.compareDocumentPosition(orderLink) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await waitFor(() => expect(chatListObserver).toBeDefined());
  act(() => chatListObserver.callback([{ isIntersecting: true }]));
  await waitFor(() =>
    expect(
      chatApi.listChats,
    ).toHaveBeenCalledWith("requester", cursor, "active"),
  );
  expect(screen.getAllByRole("link", { name: /FoC/ })).toHaveLength(1);
});

it("shows system-chat notifications as incoming FoC messages and prevents sending", async () => {
  chatApi.getChat.mockResolvedValue({
    title: "FoC",
    status: "ACTIVE",
    orderId: null,
  });
  chatApi.listMessages.mockResolvedValue({
    data: [
      {
        messageId: "notice-1",
        senderId: null,
        type: "SYSTEM",
        content: "Schedule failed",
        createdAt: "2026-11-09T12:00:00Z",
      },
    ],
    pagination: { hasMore: false, nextCursor: null },
  });
  renderChat(["/chat/system-chat"]);
  const content = await screen.findByText("Schedule failed");
  expect(content.parentElement).toHaveTextContent("FoC");
  expect(content.parentElement).toHaveClass("rounded-bl-sm");
  expect(content.parentElement.parentElement.parentElement).toHaveClass(
    "justify-start",
  );
  expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  expect(chatApi.sendMessage).not.toHaveBeenCalled();
});

// AI-generated
describe("Active and archived chat tabs", () => {
  it("shows only the active list when there are no archived chats", async () => {
    renderChat(["/chats"]);
    await screen.findByText("No chats in requester mode.");
    expect(chatApi.listChats).toHaveBeenCalledWith(
      "requester",
      undefined,
      "archived",
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("separates statuses and keeps the archived filter when loading more", async () => {
    const cursor = { id: "archived-1", updatedAt: "2026-11-10T00:00:00Z" };
    const row = (id) => ({ id, orderId: id, updatedAt: cursor.updatedAt });
    chatApi.listChats.mockImplementation(async (_role, next, status) => ({
      conversations: [
        row(
          status === "active" ? "active-1" : next ? "archived-2" : "archived-1",
        ),
      ],
      hasMore: status === "archived" && !next,
      nextCursor: status === "archived" && !next ? cursor : null,
    }));
    chatApi.getChat.mockImplementation(async (id) => ({
      title: id,
      participants: [],
    }));
    renderChat(["/chats"]);
    await screen.findByRole("link", { name: /active-1/ });
    const archived = await screen.findByRole("tab", { name: "Archived" });
    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("link", { name: /archived-1/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(archived);
    await screen.findByRole("link", { name: /archived-1/ });
    expect(
      screen.queryByRole("link", { name: /active-1/ }),
    ).not.toBeInTheDocument();
    expect(archived).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(chatListObserver).toBeDefined());
  act(() => chatListObserver.callback([{ isIntersecting: true }]));
    await screen.findByRole("link", { name: /archived-2/ });
    expect(chatApi.listChats).toHaveBeenCalledWith(
      "requester",
      cursor,
      "archived",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Active" }));
    await screen.findByRole("link", { name: /active-1/ });
    expect(
      screen.queryByRole("link", { name: /archived-1/ }),
    ).not.toBeInTheDocument();
  });
});

// AI-generated
it("keeps system chat pinned in Active and excludes it from Archived", async () => {
  const row = (id, orderId) => ({
    id,
    orderId,
    updatedAt: "2026-11-10T00:00:00Z",
  });
  const cursor = { id: "older", updatedAt: "2026-11-09T00:00:00Z" };
  chatApi.listChats.mockImplementation(async (_role, next, status) => {
    if (status)
      return {
        conversations: [
          row(status + "-chat", "order-" + status),
          ...(status === "archived" ? [row("system-chat", null)] : []),
        ],
        hasMore: false,
      };
    return next
      ? { conversations: [row("system-chat", null)], hasMore: false }
      : {
          conversations: [row("active-chat", "order-active")],
          hasMore: true,
          nextCursor: cursor,
        };
  });
  chatApi.getChat.mockImplementation(async (id) => ({
    title: id === "system-chat" ? "FoC" : id,
    participants: [],
  }));
  renderChat(["/chats"]);
  await screen.findByRole("link", { name: /FoC/ });
  expect(screen.getAllByRole("link")[0]).toHaveAttribute(
    "href",
    "/chat/system-chat",
  );
  fireEvent.click(await screen.findByRole("tab", { name: "Archived" }));
  await screen.findByRole("link", { name: /archived-chat/ });
  expect(screen.queryByRole("link", { name: /FoC/ })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /active-chat/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Active" }));
  await screen.findByRole("link", { name: /FoC/ });
});

// AI-generated
it("follows incoming messages at the bottom and shows a jump arrow when reading earlier messages", async () => {
  let scrollHeight = 1000;
  const height = vi
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockImplementation(() => scrollHeight);
  const clientHeight = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(400);
  try {
    const { container } = renderChat(["/chat/conversation-1"]);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled(),
    );
    const list = container.querySelector("ol");
    list.scrollTop = 600;
    fireEvent.scroll(list);
    const incoming = (messageId) => ({
      messageId,
      conversationId: "conversation-1",
      senderId: "other",
      type: "TEXT",
      content: messageId,
      createdAt: "2026-11-10T10:00:00Z",
    });
    scrollHeight = 1200;
    await act(async () =>
      realtime.handlers.forEach((handler) => handler(incoming("new-1"))),
    );
    expect(list.scrollTop).toBe(1200);
    expect(
      screen.queryByRole("button", { name: "Scroll to new messages" }),
    ).not.toBeInTheDocument();
    list.scrollTop = 100;
    fireEvent.scroll(list);
    scrollHeight = 1400;
    await act(async () =>
      realtime.handlers.forEach((handler) => handler(incoming("new-2"))),
    );
    expect(list.scrollTop).toBe(100);
    fireEvent.click(
      screen.getByRole("button", { name: "Scroll to new messages" }),
    );
    expect(list.scrollTop).toBe(1400);
    expect(
      screen.queryByRole("button", { name: "Scroll to new messages" }),
    ).not.toBeInTheDocument();
    // Repeated delivery of the same saved message must not move a reader's viewport.
    list.scrollTop = 100;
    fireEvent.scroll(list);
    await act(async () =>
      realtime.handlers.forEach((handler) => handler(incoming("new-2"))),
    );
    expect(list.scrollTop).toBe(100);
    expect(
      screen.queryByRole("button", { name: "Scroll to new messages" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      realtime.handlers.forEach((handler) => handler(incoming("new-3"))),
    );
    expect(
      screen.getByRole("button", { name: "Scroll to new messages" }),
    ).toBeInTheDocument();
    list.scrollTop = 1000;
    fireEvent.scroll(list);
    expect(
      screen.queryByRole("button", { name: "Scroll to new messages" }),
    ).not.toBeInTheDocument();
  } finally {
    height.mockRestore();
    clientHeight.mockRestore();
  }
});

// AI-generated
it("totals unread messages across both tab pages, counts FoC only in Active and refreshes read counts", async () => {
  let read = false;
  const cursor = { id: "older", updatedAt: "2026-11-09T00:00:00Z" };
  const row = (id, count, orderId = id) => ({
    id,
    orderId,
    unreadCount: read ? 0 : count,
    updatedAt: "2026-11-10T00:00:00Z",
  });
  chatApi.listChats.mockImplementation(async (_role, next, status) => {
    if (!status)
      return { conversations: [row("system", 4, null)], hasMore: false };
    if (status === "active")
      return next
        ? { conversations: [row("active-2", 3)], hasMore: false }
        : {
            conversations: [row("active-1", 2)],
            hasMore: true,
            nextCursor: cursor,
          };
    return next
      ? {
          conversations: [row("archived-2", 7), row("system", 4, null)],
          hasMore: false,
        }
      : {
          conversations: [row("archived-1", 5)],
          hasMore: true,
          nextCursor: cursor,
        };
  });
  chatApi.getChat.mockImplementation(async (id) => ({
    title: id,
    participants: [],
  }));
  renderChat(["/chats"]);
  expect(
    await screen.findByLabelText("Active: 9 unread messages"),
  ).toHaveTextContent("9");
  expect(
    screen.getByLabelText("Archived: 12 unread messages"),
  ).toHaveTextContent("12");
  fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
  await screen.findByRole("link", { name: /archived-1/ });
  expect(screen.getByLabelText("Active: 9 unread messages")).toHaveTextContent(
    "9",
  );
  read = true;
  act(() => window.dispatchEvent(new Event("chat-read-updated")));
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Archived: 12 unread messages"),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByLabelText("Active: 0 unread messages"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Archived: 0 unread messages"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Active" })).not.toHaveAttribute(
    "aria-describedby",
  );
});
