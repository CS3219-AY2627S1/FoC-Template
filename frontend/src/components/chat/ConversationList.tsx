// AI-assisted (Claude Opus 5.5): inbox of the user's chats with unread counts and
// typing indicators. Reviewed by authors.
import { Badge, Box, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useMemo } from "react";
import type { OrderResponse } from "../../lib/api";
import { useChat } from "../../lib/chat/context";
import { chatTitle, formatTime, memberName, preview } from "../../lib/chat/format";
import { conversationOrder, type ChatState } from "../../lib/chat/store";

const EMPTY_CONVS: ChatState["convs"] = {};
const EMPTY_TYPING: ChatState["typing"] = {};

interface Props {
  activeId: string | null;
  orders: Record<string, OrderResponse | null>;
  onOpen: (id: string) => void;
}

export function ConversationList({ activeId, orders, onOpen }: Props) {
  const convs = useChat((s) => s.convs, EMPTY_CONVS);
  const typing = useChat((s) => s.typing, EMPTY_TYPING);
  const meId = useChat((s) => s.meId, "");
  const status = useChat((s) => s.status, "connecting");
  const ordered = useMemo(() => conversationOrder(convs), [convs]);

  return (
    <Stack h="100%" gap={0}>
      <Group
        justify="space-between"
        p="sm"
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
      >
        <Text fw={600}>Chats</Text>
        <Badge
          size="sm"
          variant="dot"
          color={status === "live" ? "teal" : status === "offline" ? "red" : "yellow"}
          data-testid="chat-status"
        >
          {status === "live" ? "Live" : status === "offline" ? "Offline" : "Connecting"}
        </Badge>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        {ordered.length === 0 && (
          <Text c="dimmed" size="sm" p="md">
            No chats yet. A chat opens automatically when a courier accepts one of your
            requests, or when you accept an errand.
          </Text>
        )}
        {ordered.map(({ conv }) => {
          const unread = conv.me?.unread_count ?? 0;
          const someoneTyping = Object.keys(typing[conv.id] ?? {}).length > 0;
          const nameOf = (id: string) => memberName(conv, id, meId);
          return (
            <UnstyledButton
              key={conv.id}
              onClick={() => onOpen(conv.id)}
              w="100%"
              p="sm"
              data-testid="chat-item"
              style={{
                display: "block",
                background:
                  conv.id === activeId ? "var(--mantine-color-brand-light)" : undefined,
                borderBottom: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text fw={unread ? 700 : 500} truncate>
                    {chatTitle(conv, orders)}
                  </Text>
                  {conv.closed_at && <IconLock size={14} style={{ flexShrink: 0 }} />}
                </Group>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {formatTime(conv.last_message_at ?? conv.created_at)}
                </Text>
              </Group>
              <Group justify="space-between" wrap="nowrap" gap="xs" mt={2}>
                <Box style={{ minWidth: 0 }}>
                  <Text
                    size="sm"
                    c={someoneTyping ? "teal" : "dimmed"}
                    fs={someoneTyping ? "italic" : undefined}
                    truncate
                  >
                    {someoneTyping ? "typing…" : preview(conv.last_message, nameOf, meId)}
                  </Text>
                </Box>
                {unread > 0 && (
                  <Badge size="sm" circle={unread < 10} data-testid="unread-badge">
                    {unread}
                  </Badge>
                )}
              </Group>
            </UnstyledButton>
          );
        })}
      </ScrollArea>
    </Stack>
  );
}
