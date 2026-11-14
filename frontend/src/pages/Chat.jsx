/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Chat.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Login prompt waits for the session restore (sessionReady), as Wallet.jsx does, so a
 *        reload while signed in no longer opens it.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: /chat/:id is now wrapped in RequireAuth (App.jsx), which replaces the gating effect
 *        that opened the deleted LoginModal via requireLogin, per instructions.md Stage 16b.
 *        `currentUser`/`requests` stay on DemoContext (mocked chat data, unrelated to auth).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Per instructions.md Stage 22's "Chat back arrow (mobile)" row: the mobile back arrow
 *        now goes back to the previous in-app page (navigate(-1)) instead of the fixed
 *        /activity link, or to the current view's main page when there is no previous in-app
 *        page (opened directly by URL or in a new tab), using the new
 *        routing/navigationHistory.js tracker.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Connected the team-requested frontend chat entry points and existing HTTP contracts.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added the requested /chats list with titles, previews and conversation navigation.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Verified message submission and added send-button feedback and regression tests.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified chat room subscriptions and realtime frontend updates.
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
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced the shortened double-check glyph with two complete overlapping ticks.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Tightened the overlap between read receipt ticks as requested.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Styled system notices and centered their subdued timestamps.
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
 * Scope (2026-11-08, Codex, model: GPT-6): Suppressed the loading label during message submission.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Removed the sidebar loading-chats label as requested.
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
 * Scope (2026-11-09, Codex, model: GPT-6): Pinned system chats and displayed their messages as incoming from FoC.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Added the team-specified Auto-translate switch, per-message Show original/Translate control and translated message display.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Codex, model: GPT-6): Moved translation control above the timestamp.
 * Author review:
 * Scope (2026-11-09, Codex, model: GPT-6): Moved message metadata below chat bubbles.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Hid the chat list on individual chat pages per user instruction.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested requested active/archived chat list tabs using the existing status filter.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Restored the pinned system chat independently of the selected status tab.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Restricted system chat to the Active list per user correction.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Added bottom-aware new-message scrolling and a jump-to-new-messages arrow.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Moved the new-message arrow to the bottom-right with light secondary button colors.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Added paginated unread-message totals to Active and Archived tab badges.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Positioned unread tab badges at the top-right like the chat icon and hid zero counts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Nudged tab unread badges further up and right as requested.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Combined existing translation and chat branch changes during merge resolution.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented user-requested automatic conversation pagination on bottom scrolling.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Left-aligned the mobile chat title and reduced mobile composer sizing per user instruction.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  MessageCircle,
  Send,
  Check,
  Languages,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  findOrderChat,
  getChat,
  listChats,
  listMessages,
  markMessagesRead,
  sendMessage,
  setTranslation,
} from "../api/chat";
import { getProfile } from "../api/profile";
import {
  useChatRoom,
  useChatMessages,
  useChatReady,
  useChatReads,
  useChatTranslations,
} from "../realtime/chatSocket";
import { useUserName } from "../api/lookups";

export default function Chat() {
  const { user } = useAuth();
  return <ChatView key={user?.activeView} />;
}

// Order chats retain API ordering; the system conversation is pinned ahead of them.
// AI-generated
function pinSystemChat(conversations) {
  const unique = [
    ...new Map(conversations.map((chat) => [chat.id, chat])).values(),
  ];
  return [
    ...unique.filter((chat) => chat.orderId === null),
    ...unique.filter((chat) => chat.orderId !== null),
  ];
}

// Details supplies each stored title.
async function loadChatPage(role, cursor, status) {
  const page = await listChats(role, cursor, status);
  let rows =
    status === "archived"
      ? page.conversations.filter((chat) => chat.orderId !== null)
      : page.conversations;
  if (
    status !== "archived" &&
    !cursor &&
    !rows.some((chat) => chat.orderId === null)
  ) {
    // AI-generated
    // System chat stays pinned in Active, even when absent from its filtered page.
    // Search unfiltered pages without changing the selected tab's order cursor.
    let searchPage = await listChats(role);
    const visited = new Set();
    while (true) {
      const systemChat = searchPage.conversations.find(
        (chat) => chat.orderId === null,
      );
      if (systemChat) {
        rows = [...rows, systemChat];
        break;
      }
      if (!searchPage.hasMore || !searchPage.nextCursor) break;
      const key = JSON.stringify(searchPage.nextCursor);
      if (visited.has(key)) break;
      visited.add(key);
      searchPage = await listChats(role, searchPage.nextCursor);
    }
  }
  const conversations = await Promise.all(
    rows.map(async (chat) => {
      const details = await getChat(chat.id);
      return {
        ...chat,
        title: details.title,
        participants: details.participants,
      };
    }),
  );
  return { ...page, conversations: pinSystemChat(conversations) };
}

// AI-generated
async function loadTabUnreadCounts(role) {
  const loadStatus = async (status) => {
    const rows = new Map();
    const visited = new Set();
    let cursor;
    do {
      const page = await listChats(role, cursor, status);
      page.conversations.forEach((chat) => rows.set(chat.id, chat));
      if (!page.hasMore || !page.nextCursor) break;
      const key = JSON.stringify(page.nextCursor);
      if (visited.has(key)) break;
      visited.add(key);
      cursor = page.nextCursor;
    } while (true);
    return rows;
  };
  const [active, archived] = await Promise.all([
    loadStatus("active"),
    loadStatus("archived"),
  ]);
  // FoC belongs to Active even when returned by the archived status filter.
  for (const [id, chat] of archived) {
    if (chat.orderId === null) {
      if (!active.has(id)) active.set(id, chat);
      archived.delete(id);
    }
  }
  const total = (rows) =>
    [...rows.values()].reduce((sum, chat) => sum + (chat.unreadCount ?? 0), 0);
  return {
    active: total(active),
    archived: total(archived),
    hasArchived: archived.size > 0,
  };
}

function ChatTitle({ chat, role }) {
  const otherRole = role === "requester" ? "COURIER" : "REQUESTER";
  const participant = chat?.participants?.find(
    (item) => item.role === otherRole,
  );
  const name = useUserName(participant?.userId);
  return (
    <>
      {name ? `${name} · ` : ""}
      {chat?.title ?? "Chat"}
    </>
  );
}

function chatListTime(value) {
  const date = new Date(value);
  const now = new Date();
  if (date.getFullYear() !== now.getFullYear())
    return String(date.getFullYear());
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function ChatView() {
  const { id } = useParams();
  const { state } = useLocation();
  const errandReturnTo = ["/my-errands", "/my-deliveries"].includes(
    state?.errandReturnTo,
  )
    ? state.errandReturnTo
    : null;
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const { user } = useAuth();
  const navigate = useNavigate();
  // AI-generated
  const [status, setStatus] = useState("active");
  const [hasArchived, setHasArchived] = useState(false);
  const [tabUnread, setTabUnread] = useState({ active: 0, archived: 0 });
  const [page, setPage] = useState(null);
  const listBottom = useRef(null);
  const listGeneration = useRef(0);
  const loadingMore = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  useChatMessages(() => setRetry((v) => v + 1));
  useChatReady(() => setRetry((v) => v + 1));
  const role = user?.activeView;
  useEffect(() => {
    if (id || orderId) return;
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("chat-read-updated", refresh);
    return () => window.removeEventListener("chat-read-updated", refresh);
  }, [id, orderId]);
  useEffect(() => {
    let live = true;
    listGeneration.current += 1;
    loadingMore.current = false;
    setPage(null);
    setError(null);
    setLoading(true);
    const load = orderId
      ? findOrderChat(orderId, role)
      : loadChatPage(role, undefined, status);
    load
      .then((result) => {
        if (!live) return;
        if (orderId)
          navigate("/chat/" + result.id, {
            replace: true,
            state: errandReturnTo ? { errandReturnTo } : null,
          });
        else setPage(result);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [role, orderId, navigate, retry, errandReturnTo, status]);

  // AI-generated
  useEffect(() => {
    if (id || orderId) return;
    let live = true;
    setTabUnread({ active: 0, archived: 0 });
    loadTabUnreadCounts(role)
      .then((result) => {
        if (!live) return;
        setTabUnread({ active: result.active, archived: result.archived });
        setHasArchived(result.hasArchived);
        if (!result.hasArchived) setStatus("active");
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [role, user?.id, retry, id, orderId]);

  // AI-generated (edited by <name>).
  const more = useCallback(async () => {
    if (loading || loadingMore.current || error || !page?.hasMore) return;
    const generation = listGeneration.current;
    loadingMore.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = await loadChatPage(role, page.nextCursor, status);
      // Ignore responses from a previously selected list.
      if (generation !== listGeneration.current) return;
      setPage((prev) => ({
        ...next,
        conversations: pinSystemChat([
          ...prev.conversations,
          ...next.conversations,
        ]),
      }));
    } catch (err) {
      if (generation === listGeneration.current) setError(err.message);
    } finally {
      if (generation === listGeneration.current) {
        loadingMore.current = false;
        setLoading(false);
      }
    }
  }, [loading, error, page, role, status]);

  // AI-generated (edited by <name>).
  useEffect(() => {
    if (id || orderId || loading || error || !page?.hasMore || !listBottom.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void more();
    });
    observer.observe(listBottom.current);
    return () => observer.disconnect();
  }, [id, orderId, loading, error, page, more]);

  const onRead = useCallback((conversationId) => {
    setPage((previous) =>
      previous
        ? {
            ...previous,
            conversations: previous.conversations.map((chat) =>
              chat.id === conversationId ? { ...chat, unreadCount: 0 } : chat,
            ),
          }
        : previous,
    );
  }, []);
  return (
    <div className="page-width page-gutter py-6">
      {errandReturnTo && (
        <button
          type="button"
          onClick={() => navigate(errandReturnTo)}
          aria-label="Go back"
          className="mb-4 flex h-11 items-center gap-2"
        >
          <ArrowLeft size={20} /> Back
        </button>
      )}
      <div className="flex gap-6">
        {/* AI-generated */}
        {!id && (
          <aside className="w-full shrink-0 rounded-card border border-line bg-surface p-4">
            <h1 className="mb-4 text-lg font-semibold">Chats</h1>
            {/* AI-generated */}
            {hasArchived && (
              <div
                role="tablist"
                aria-label="Chat status"
                className="mb-4 flex gap-2"
              >
                {["active", "archived"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    disabled={loading}
                    aria-selected={status === value}
                    aria-label={value === "active" ? "Active" : "Archived"}
                    aria-describedby={
                      tabUnread[value] > 0 ? `chat-${value}-unread` : undefined
                    }
                    onClick={() => setStatus(value)}
                    className={
                      "relative rounded-btn px-4 py-2 text-sm font-semibold " +
                      (status === value
                        ? "bg-ink text-white"
                        : "bg-surface-alt text-ink-70")
                    }
                  >
                    {value === "active" ? "Active" : "Archived"}
                    {tabUnread[value] > 0 && (
                      <span
                        id={`chat-${value}-unread`}
                        aria-label={`${value === "active" ? "Active" : "Archived"}: ${tabUnread[value]} unread messages`}
                        className="tnum absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-orange px-1.5 text-[11px] font-semibold text-white"
                      >
                        {tabUnread[value]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <div role="alert">
                {error}{" "}
                <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
              </div>
            )}
            {page?.conversations.length === 0 && (
              <p>No chats in {role} mode.</p>
            )}
            <ul>
              {page?.conversations.map((chat) => (
                <li
                  key={chat.id}
                  className="border-b border-line last:border-0"
                >
                  <Link
                    state={errandReturnTo ? { errandReturnTo } : null}
                    to={"/chat/" + chat.id}
                    aria-current={id === chat.id ? "page" : undefined}
                    className="flex items-center gap-3 rounded-btn px-2 py-4 hover:bg-surface-alt"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-70">
                      <MessageCircle size={22} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">
                          <ChatTitle chat={chat} role={role} />
                        </span>
                        <time
                          dateTime={chat.updatedAt}
                          className="shrink-0 text-xs text-ink-40"
                        >
                          {chatListTime(chat.updatedAt)}
                        </time>
                      </span>
                      <span className="mt-1 block truncate text-sm text-ink-70">
                        {chat.lastMessage?.content ??
                          (chat.lastMessage
                            ? chat.lastMessage.type
                            : "No messages yet")}
                      </span>
                    </span>
                    {chat.unreadCount > 0 && (
                      <span
                        aria-label={`${chat.unreadCount} unread messages`}
                        className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-semibold text-white"
                      >
                        {chat.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {page?.hasMore && (
              <div ref={listBottom} className="h-px" aria-hidden="true" />
            )}
          </aside>
        )}
        {id && (
          <Thread
            key={id + ":" + role}
            id={id}
            user={user}
            onRead={onRead}
            errandReturnTo={errandReturnTo}
          />
        )}
      </div>
    </div>
  );
}

// HTTP responses and socket delivery may arrive in either order; retain one row per saved ID.
function mergeMessages(previous, incoming) {
  return [
    ...new Map(
      [...previous, ...incoming].map((message) => [message.messageId, message]),
    ).values(),
  ].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.messageId.localeCompare(b.messageId),
  );
}

// AI-generated (edited by <name>).
function translationsOf(messages) {
  return Object.fromEntries(
    messages
      .filter((message) => message.translatedContent != null)
      .map((message) => [message.messageId, message.translatedContent]),
  );
}

function Thread({ id, user, onRead, errandReturnTo }) {
  const messageList = useRef(null);
  const messageInput = useRef(null);
  const initiallyScrolled = useRef(false);
  const firstUnreadId = useRef(null);
  const refocusAfterSend = useRef(false);
  const atBottom = useRef(true);
  const previousLatestId = useRef(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const loadingOlder = useRef(false);
  const olderScroll = useRef(null);
  const [chat, setChat] = useState(null);
  const [readPositions, setReadPositions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  // AI-generated (edited by <name>).
  // translateTo: the saved Auto-translate language (null = off). translations: messageId -> text
  // ("SAME" = already in the preferred language). viewOverride: messageId -> "original" | "translated".
  const [translateTo, setTranslateTo] = useState(null);
  const [preferredLang, setPreferredLang] = useState(null);
  const [translations, setTranslations] = useState({});
  const [viewOverride, setViewOverride] = useState({});
  const [toggling, setToggling] = useState(false);
  useChatTranslations((translated) => {
    if (translated.conversationId !== id) return;
    setTranslations((prev) => ({
      ...prev,
      [translated.messageId]: translated.translatedContent,
    }));
  });
  useEffect(() => {
    let live = true;
    // The preferred language is read when the chat opens and sent with the toggle call.
    getProfile().then(
      (profile) => live && setPreferredLang(profile.preferredLang),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  useChatRoom(id, (message) => {
    if (message) setError(message);
  });
  useChatReady(() => setRetry((v) => v + 1));
  useChatMessages((message) => {
    if (message.conversationId !== id) return;
    setMessages((prev) => mergeMessages(prev, [message]));
  });
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(null);
    Promise.all([getChat(id), listMessages(id)])
      .then(async ([details, history]) => {
        if (!live) return;
        if (!initiallyScrolled.current) {
          const reader = history.participants?.find(
            (participant) => participant.userId === user?.id,
          );
          if (reader) {
            // Find the saved boundary before marking the newly displayed history as read.
            while (
              history.pagination.hasMore &&
              (!reader.lastReadMessageId ||
                !history.data.some(
                  (message) => message.messageId === reader.lastReadMessageId,
                ))
            ) {
              const olderPage = await listMessages(
                id,
                history.pagination.nextCursor,
              );
              if (!live) return;
              history = {
                ...history,
                data: mergeMessages(history.data, olderPage.data),
                pagination: olderPage.pagination,
              };
            }
            const ordered = mergeMessages([], history.data);
            const boundary = reader.lastReadMessageId
              ? ordered.findIndex(
                  (message) => message.messageId === reader.lastReadMessageId,
                )
              : -1;
            firstUnreadId.current =
              ordered.find(
                (message, index) =>
                  index > boundary && message.senderId !== user?.id,
              )?.messageId ?? null;
          }
        }
        setChat(details);
        setTranslateTo(
          history.participants?.find((p) => p.userId === user?.id)
            ?.translateTo ?? null,
        );
        setTranslations((prev) => ({
          ...prev,
          ...translationsOf(history.data),
        }));
        setMessages((prev) => mergeMessages(prev, history.data));
        setReadPositions((previous) => [
          ...new Set([
            ...previous,
            ...(history.participants ?? [])
              .filter(
                (participant) =>
                  participant.userId !== user?.id &&
                  participant.lastReadMessageId,
              )
              .map((participant) => participant.lastReadMessageId),
          ]),
        ]);
        setPagination(history.pagination);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [id, retry, user?.id]);
  useChatReads((receipt) => {
    if (receipt.conversationId !== id || receipt.userId === user?.id) return;
    setReadPositions((previous) =>
      previous.includes(receipt.lastReadMessageId)
        ? previous
        : [...previous, receipt.lastReadMessageId],
    );
  });
  const readThrough = messages.reduce(
    (latest, message, index) =>
      readPositions.includes(message.messageId) ? index : latest,
    -1,
  );
  const latestMessageId = messages.at(-1)?.messageId;
  useEffect(() => {
    if (!latestMessageId) return;
    let live = true;
    // The existing endpoint advances monotonically, so older history cannot rewind the receipt.
    markMessagesRead(id, latestMessageId)
      .then(() => {
        if (live) onRead(id);
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [id, latestMessageId, retry, onRead]);
  // AI-generated
  useLayoutEffect(() => {
    if (!pagination || busy) return;
    const wasInitiallyScrolled = initiallyScrolled.current;
    if (!initiallyScrolled.current && messageList.current) {
      const list = messageList.current;
      const target = [...list.children].find(
        (element) => element.dataset.messageId === firstUnreadId.current,
      );
      const targetTop = target
        ? target.getBoundingClientRect().top -
          list.getBoundingClientRect().top +
          list.scrollTop
        : null;
      const bottomTop = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop =
        targetTop !== null && targetTop < bottomTop
          ? targetTop
          : list.scrollHeight;
      initiallyScrolled.current = true;
      atBottom.current =
        list.scrollHeight - list.clientHeight - list.scrollTop <= 1;
    }
    if (olderScroll.current && messageList.current) {
      const list = messageList.current;
      list.scrollTop =
        olderScroll.current.top +
        list.scrollHeight -
        olderScroll.current.height;
      olderScroll.current = null;
    }
    // Only changes at the newest edge count: prepending history must preserve the viewport.
    if (
      wasInitiallyScrolled &&
      latestMessageId !== previousLatestId.current &&
      messageList.current
    ) {
      if (atBottom.current) {
        messageList.current.scrollTop = messageList.current.scrollHeight;
        setHasNewMessages(false);
      } else {
        setHasNewMessages(true);
      }
    }
    previousLatestId.current = latestMessageId;
    // Wait for React to re-enable the input before returning focus to it.
    if (refocusAfterSend.current) {
      messageInput.current?.focus();
      refocusAfterSend.current = false;
    }
  }, [busy, pagination, latestMessageId]);
  const older = async () => {
    if (
      busy ||
      loadingOlder.current ||
      !pagination?.hasMore ||
      !initiallyScrolled.current
    )
      return;
    loadingOlder.current = true;
    const list = messageList.current;
    const anchor = { top: list.scrollTop, height: list.scrollHeight };
    setBusy(true);
    setError(null);
    try {
      const history = await listMessages(id, pagination.nextCursor);
      olderScroll.current = anchor;
      setTranslations((prev) => ({ ...prev, ...translationsOf(history.data) }));
      setMessages((prev) => mergeMessages(prev, history.data));
      setReadPositions((previous) => [
        ...new Set([
          ...previous,
          ...(history.participants ?? [])
            .filter(
              (participant) =>
                participant.userId !== user?.id &&
                participant.lastReadMessageId,
            )
            .map((participant) => participant.lastReadMessageId),
        ]),
      ]);
      setPagination(history.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      loadingOlder.current = false;
      setBusy(false);
    }
  };
  // AI-generated (edited by <name>).
  const toggleTranslate = async () => {
    const enable = translateTo === null;
    setToggling(true);
    setError(null);
    try {
      const result = await setTranslation(
        id,
        enable
          ? { enabled: true, language: preferredLang }
          : { enabled: false },
      );
      setTranslateTo(result.translateTo);
      setViewOverride({});
    } catch (err) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };
  const send = async (event) => {
    event.preventDefault();
    if (
      !text.trim() ||
      busy ||
      chat?.status !== "ACTIVE" ||
      chat?.orderId === null
    )
      return;
    refocusAfterSend.current = true;
    setSending(true);
    setBusy(true);
    setError(null);
    try {
      const message = await sendMessage(id, text);
      setMessages((prev) => mergeMessages(prev, [message]));
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setSending(false);
    }
  };
  return (
    <section className="min-w-0 flex-1 rounded-card border border-line p-4">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-line pb-3">
        <Link
          to="/chats"
          state={errandReturnTo ? { errandReturnTo } : null}
          aria-label="Back to chats"
          className="flex h-11 w-11 items-center justify-center rounded-btn hover:bg-surface-alt"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h2 className="text-left text-lg font-semibold md:text-center">
          <ChatTitle chat={chat} role={user?.activeView} />
        </h2>
        <div className="flex items-center gap-2">
          <span id="auto-translate-label" className="text-xs text-ink-70">
            Auto-translate
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={translateTo !== null}
            aria-labelledby="auto-translate-label"
            disabled={
              toggling || !chat || (translateTo === null && !preferredLang)
            }
            onClick={toggleTranslate}
            className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50 md:h-6 md:w-10"
          >
            <span
              className={
                "relative block h-6 w-10 rounded-full transition-colors duration-150 " +
                (translateTo !== null ? "bg-blue" : "bg-line")
              }
              aria-hidden="true"
            >
              <span
                className={
                  "absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all duration-150 " +
                  (translateTo !== null ? "left-[18px]" : "left-0.5")
                }
              />
            </span>
          </button>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {busy && !sending && <p role="status">Loading…</p>}
      <div className="relative">
        <ol
          ref={messageList}
          onScroll={(event) => {
            const list = event.currentTarget;
            atBottom.current =
              list.scrollHeight - list.clientHeight - list.scrollTop <= 1;
            if (atBottom.current) setHasNewMessages(false);
            if (list.scrollTop <= 0) void older();
          }}
          className="my-4 max-h-[60vh] space-y-3 overflow-y-auto px-1 [overflow-anchor:none]"
        >
          {messages.map((message, index) => {
            const systemChat = chat?.orderId === null;
            const own = !systemChat && message.senderId === user?.id;
            const system = !systemChat && message.type === "SYSTEM";
            const read = index <= readThrough;
            const date = new Date(message.createdAt);
            // AI-generated (edited by <name>).
            // Only received messages have translations; "SAME" has no alternative to show.
            const translation =
              !own && !system ? translations[message.messageId] : undefined;
            const hasTranslation =
              translation !== undefined && translation !== "SAME";
            const showTranslated =
              hasTranslation &&
              (viewOverride[message.messageId] ??
                (translateTo !== null ? "translated" : "original")) ===
                "translated";
            const startsDay =
              index === 0 ||
              date.toDateString() !==
                new Date(messages[index - 1].createdAt).toDateString();
            return (
              <li key={message.messageId} data-message-id={message.messageId}>
                {startsDay && (
                  <div className="my-4 flex justify-center">
                    <time
                      dateTime={message.createdAt}
                      className="rounded-full bg-surface-alt px-3 py-1 text-xs font-medium text-ink-70"
                    >
                      {date.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </time>
                  </div>
                )}
                <div
                  className={`flex ${system ? "justify-center" : own ? "justify-end" : "justify-start"}`}
                >
                  <div className="min-w-0 max-w-[85%]">
                    {/* AI-generated (edited by <name>). */}
                    <div
                      className={
                        system
                          ? "rounded-2xl border border-line bg-surface-alt px-4 py-2 text-center text-sm text-ink-70"
                          : `min-w-0 rounded-2xl px-4 py-3 ${own ? "rounded-br-sm bg-ink text-white" : "rounded-bl-sm bg-surface-alt text-ink"}`
                      }
                    >
                      {systemChat && (
                        <p className="mb-1 text-xs font-semibold text-ink-70">
                          FoC
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {showTranslated ? translation : message.content}
                      </p>
                    </div>
                    {hasTranslation && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewOverride((prev) => ({
                            ...prev,
                            [message.messageId]: showTranslated
                              ? "original"
                              : "translated",
                          }))
                        }
                        className="mt-1 flex min-h-[44px] items-center gap-1 text-xs font-medium text-blue hover:underline md:min-h-0"
                      >
                        <Languages size={13} aria-hidden="true" />
                        {showTranslated ? "Show original" : "Translate"}
                      </button>
                    )}
                    <div
                      className={`mt-1 flex items-center gap-2 ${system ? "justify-center" : own ? "justify-end" : "justify-start"} text-ink-40`}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <time
                          dateTime={message.createdAt}
                          className={
                            system
                              ? "shrink-0 text-[10px] leading-4 text-ink-40"
                              : "shrink-0 text-xs leading-5 text-ink-40"
                          }
                        >
                          {date.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </time>
                        {own && !system && (
                          <span
                            className="relative inline-flex h-5 w-6 shrink-0 items-center justify-center"
                            role="img"
                            aria-label={read ? "Read" : "Sent"}
                            title={read ? "Read" : "Sent"}
                          >
                            {read ? (
                              <>
                                <Check
                                  size={18}
                                  className="absolute left-0 top-px"
                                  aria-hidden="true"
                                />
                                <Check
                                  size={18}
                                  className="absolute left-1 top-px"
                                  aria-hidden="true"
                                />
                              </>
                            ) : (
                              <Check size={18} aria-hidden="true" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {hasNewMessages && (
          <button
            type="button"
            aria-label="Scroll to new messages"
            title="New messages"
            className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-modal hover:border-ink"
            onClick={() => {
              if (messageList.current)
                messageList.current.scrollTop =
                  messageList.current.scrollHeight;
              atBottom.current = true;
              setHasNewMessages(false);
            }}
          >
            <ArrowDown size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          ref={messageInput}
          aria-label="Message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={
            busy || !chat || chat.status !== "ACTIVE" || chat.orderId === null
          }
          className="h-10 min-w-0 flex-1 rounded-btn border border-line px-3 py-2 text-sm md:h-auto md:p-3 md:text-base"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={
            busy ||
            !text.trim() ||
            chat?.status !== "ACTIVE" ||
            chat?.orderId === null
          }
          className="flex h-10 items-center gap-1.5 rounded-btn bg-ink px-3 text-sm text-white disabled:opacity-50 md:h-auto md:gap-2 md:px-4 md:text-base"
        >
          <Send size={20} className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" /> Send
        </button>
      </form>
    </section>
  );
}
