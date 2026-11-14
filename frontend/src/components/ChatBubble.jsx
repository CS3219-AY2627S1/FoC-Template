/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-09
 * Scope: Generated UI mockup component ChatBubble.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Reads isLoggedIn from the new AuthContext instead of DemoContext, per
 *        instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-08, Codex, model: GPT-6): Added the requested /chats list with titles, previews and conversation navigation.
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
 * Scope (2026-11-10, Codex, model: GPT-6): Added the stored chat title above notification text using existing chat details.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Added sender names to user-message notification headings using the existing lookup.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Suppressed incoming notifications for the currently open conversation.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import { Link, useLocation, useMatch } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getChat, listChats } from "../api/chat";
import { useUserName } from "../api/lookups";
import { useChatMessages, useChatReady } from "../realtime/chatSocket";
import { useToast } from "./Toast";
import { useAuth } from "../context/AuthContext";

// AI-generated
function NotificationTitle({ title, senderId }) {
  const name = useUserName(senderId);
  return (
    <span className="block font-semibold">
      {name ? `${name} · ${title}` : title}
    </span>
  );
}

// Shortcut into the conversations, fixed to the bottom-right.
// Hidden when logged out - there are no conversations to reach - and hidden on the chat
// screen itself, where it would point at the page you are already on.
export default function ChatBubble() {
  const location = useLocation();
  const { pathname } = location;
  const openChat = useMatch("/chat/:id");
  const openChatId = useRef(null);
  openChatId.current = openChat?.params.id ?? null;
  const { showToast } = useToast();
  const { isLoggedIn, user } = useAuth();
  const [unread, setUnread] = useState({ role: null, userId: null, count: 0 });
  const [chatRefresh, setChatRefresh] = useState(0);
  const [animation, setAnimation] = useState(0);
  const lastAnimatedMessage = useRef(null);
  // AI-generated
  useChatMessages((message) => {
    setChatRefresh((value) => value + 1);
    if (
      !isLoggedIn ||
      message.conversationId === openChatId.current ||
      message.senderId === user?.id ||
      message.triggeredByUserId === user?.id ||
      !message.messageId
    )
      return;
    if (lastAnimatedMessage.current === message.messageId) return;
    lastAnimatedMessage.current = message.messageId;
    // Use the existing details endpoint: realtime messages carry the conversation ID.
    const notify = (title) => {
      // The user may open this conversation while its title is loading.
      if (message.conversationId === openChatId.current) return;
      showToast(
        <>
          <NotificationTitle
            title={title}
            senderId={message.type === "SYSTEM" ? null : message.senderId}
          />
          <span className="block">
            {message.content || "You have a new message"}
          </span>
        </>,
        "info",
      );
    };
    getChat(message.conversationId).then(
      (chat) => notify(chat.title || "Chat"),
      () => notify("Chat"),
    );
    if (!pathname.startsWith("/chat")) setAnimation((value) => value + 1);
  });
  useChatReady(() => setChatRefresh((value) => value + 1));
  useEffect(() => {
    const refresh = () => setChatRefresh((value) => value + 1);
    window.addEventListener("chat-read-updated", refresh);
    return () => window.removeEventListener("chat-read-updated", refresh);
  }, []);
  useEffect(() => {
    if (!isLoggedIn) return;
    let live = true;
    const load = async () => {
      let cursor;
      let count = 0;
      do {
        const page = await listChats(user.activeView, cursor);
        if (!live) return;
        count += page.conversations.reduce(
          (sum, chat) => sum + chat.unreadCount,
          0,
        );
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor);
      if (live) setUnread({ role: user.activeView, userId: user.id, count });
    };
    load().catch(() => {});
    return () => {
      live = false;
    };
  }, [isLoggedIn, user?.id, user?.activeView, location.pathname, chatRefresh]);
  const unreadCount =
    isLoggedIn && unread.role === user?.activeView && unread.userId === user?.id
      ? unread.count
      : 0;

  if (!isLoggedIn || pathname.startsWith("/chat")) return null;

  return (
    <Link
      key={animation}
      to="/chats"
      aria-label={
        unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"
      }
      className={`${animation ? "chat-new-message " : ""}fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-pill bg-ink text-white shadow-modal transition-colors duration-150 hover:bg-ink-70`}
    >
      <MessageCircle size={22} aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="tnum absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-orange px-1.5 text-[11px] font-semibold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
