// AI-assisted (Claude Opus 5.5): one open chat (history, live messages, receipts,
// typing, replies, edits), ported from the standalone chat demo and linked to the
// order it belongs to. Reviewed by authors.
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconLock } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OrderResponse } from "../../lib/api";
import { useChat, useController } from "../../lib/chat/context";
import { describeError } from "../../lib/chat/controller";
import { chatTitle, memberName, orderIdOf } from "../../lib/chat/format";
import { sortedMessages, tickState, type ChatState } from "../../lib/chat/store";
import type { ChatMessage } from "../../lib/chat/types";
import { OrderStatusBadge } from "../StatusPill";
import { Composer } from "./Composer";
import { MessageBubble, SystemLine } from "./MessageBubble";

const EMPTY_PENDING: ChatState["pending"] = {};

interface Props {
  id: string;
  orders: Record<string, OrderResponse | null>;
  /** Shown on narrow screens, where the list and the chat do not fit side by side. */
  onBack?: () => void;
}

export function ConversationView({ id, orders, onBack }: Props) {
  const controller = useController();
  const c = useChat((s) => s.convs[id], undefined);
  const meId = useChat((s) => s.meId, "");
  const allPending = useChat((s) => s.pending, EMPTY_PENDING);
  const typingMap = useChat((s) => s.typing[id], undefined);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  const messages = useMemo(() => (c ? sortedMessages(c) : []), [c]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const pending = useMemo(
    () =>
      Object.values(allPending)
        .filter((p) => p.conversation_id === id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [allPending, id],
  );
  const conv = c?.conv;
  const nameOf = (uid: string) => memberName(conv, uid, meId);
  const typingNames = Object.keys(typingMap ?? {}).map(nameOf);

  // Stay pinned to the bottom when new messages arrive, unless the user scrolled up.
  useLayoutEffect(() => {
    const el = viewport.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending.length, typingNames.length]);

  useEffect(() => {
    nearBottom.current = true;
    setReplyTo(null);
  }, [id]);

  if (!c || !conv) return null;
  const closed = Boolean(conv.closed_at);
  const orderId = orderIdOf(conv);
  const order = orderId ? orders[orderId] : null;
  const others = conv.members.filter((m) => m.user_id !== meId).map((m) => nameOf(m.user_id));

  const loadOlder = async () => {
    const el = viewport.current;
    const before = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      await controller.loadOlder(id);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - before; // keep the reading position
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      notifications.show({ color: "red", message: describeError(err) });
    }
  };

  return (
    <Stack h="100%" gap={0}>
      <Group
        px="md"
        py="xs"
        gap="sm"
        wrap="nowrap"
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
      >
        {onBack && (
          <ActionIcon variant="subtle" onClick={onBack} aria-label="Back to chats">
            <IconArrowLeft size={18} />
          </ActionIcon>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group gap="xs" wrap="nowrap">
            <Title order={5} lineClamp={1} data-testid="chat-title">
              {chatTitle(conv, orders)}
            </Title>
            {order && (
              <span style={{ flexShrink: 0, display: "inline-flex" }}>
                <OrderStatusBadge status={order.status} />
              </span>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {others.length ? `With ${others.join(", ")}` : "No one else is in this chat"}
          </Text>
        </div>
        {orderId && (
          <Anchor component={Link} to={`/orders/${orderId}`} size="sm" style={{ flexShrink: 0 }}>
            View order
          </Anchor>
        )}
      </Group>

      {closed && (
        <Alert color="gray" radius={0} icon={<IconLock size={16} />} py={6}>
          This chat is read-only.
        </Alert>
      )}

      <ScrollArea
        style={{ flex: 1 }}
        viewportRef={viewport}
        px="md"
        onScrollPositionChange={() => {
          const el = viewport.current;
          if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!c.loaded && (
          <Center p="md">
            <Loader size="sm" />
          </Center>
        )}
        {c.loaded && c.hasOlder && (
          <Center py="xs">
            <Button size="xs" variant="subtle" onClick={loadOlder} loading={loadingOlder}>
              Load older messages
            </Button>
          </Center>
        )}
        <div style={{ paddingTop: 8, paddingBottom: 8 }} data-testid="message-list">
          {messages.map((m, i) => {
            if (m.kind === "system") return <SystemLine key={m.id} message={m} nameOf={nameOf} />;
            const mine = m.sender_id === meId;
            const prev = messages[i - 1];
            const showSender =
              !mine && (!prev || prev.sender_id !== m.sender_id || prev.kind === "system");
            const replied = m.reply_to_id ? (byId.get(m.reply_to_id) ?? null) : undefined;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                mine={mine}
                senderName={showSender && m.sender_id ? nameOf(m.sender_id) : undefined}
                tick={mine ? tickState(c, meId, m.seq) : undefined}
                replyTo={replied}
                replyName={replied?.sender_id ? nameOf(replied.sender_id) : undefined}
                onReply={closed ? undefined : () => setReplyTo(m)}
                onEdit={
                  closed
                    ? undefined
                    : () => {
                        setEditing(m);
                        setEditText(m.body ?? "");
                      }
                }
                onDelete={closed ? undefined : () => act(() => controller.remove(m.id))}
              />
            );
          })}
          {pending.map((p) => (
            <MessageBubble
              key={p.client_msg_id}
              message={p}
              mine
              tick={p.status === "failed" ? "failed" : "pending"}
              error={p.error}
              replyTo={p.reply_to_id ? (byId.get(p.reply_to_id) ?? null) : undefined}
              onRetry={() => controller.retry(p.client_msg_id)}
              onDiscard={() => controller.discard(p.client_msg_id)}
            />
          ))}
        </div>
      </ScrollArea>

      <Text size="xs" c="dimmed" px="md" h={18} fs="italic" data-testid="typing-indicator">
        {typingNames.length
          ? `${typingNames.join(", ")} ${typingNames.length > 1 ? "are" : "is"} typing…`
          : ""}
      </Text>

      <Composer
        conversationId={id}
        disabled={closed}
        replyTo={replyTo}
        replyName={replyTo?.sender_id ? nameOf(replyTo.sender_id) : ""}
        onCancelReply={() => setReplyTo(null)}
        onSend={(content) => {
          nearBottom.current = true;
          controller.send(id, content);
        }}
        onTyping={() => controller.typing(id)}
      />

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title="Edit message">
        <Stack>
          <Textarea
            autosize
            minRows={2}
            value={editText}
            onChange={(e) => setEditText(e.currentTarget.value)}
            maxLength={4000}
          />
          <Button
            disabled={!editText.trim()}
            onClick={() => {
              const target = editing;
              setEditing(null);
              if (target) void act(() => controller.edit(target.id, editText.trim()));
            }}
          >
            Save
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
