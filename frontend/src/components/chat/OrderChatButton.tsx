// AI-assisted (Claude Opus 5.5): opens an order's chat. Renders nothing until
// chat-service has opened the chat (when a courier accepts the order), and
// disappears again if the user loses access (e.g. the courier withdrew).
// Reviewed by authors.
import { Badge, Button, type MantineSize } from "@mantine/core";
import { IconMessages } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useChat } from "../../lib/chat/context";
import { orderIdOf } from "../../lib/chat/format";

interface Props {
  orderId: string;
  label?: string;
  size?: MantineSize;
}

export function OrderChatButton({ orderId, label = "Chat", size = "xs" }: Props) {
  const chatId = useChat(
    (s) => Object.values(s.convs).find((c) => orderIdOf(c.conv) === orderId)?.conv.id ?? null,
    null,
  );
  const unread = useChat(
    (s) => (chatId ? (s.convs[chatId]?.conv.me?.unread_count ?? 0) : 0),
    0,
  );
  if (!chatId) return null;
  return (
    <Button
      component={Link}
      to={`/messages/${chatId}`}
      size={size}
      variant="light"
      leftSection={<IconMessages size={16} />}
      rightSection={
        unread > 0 ? (
          <Badge size="xs" circle={unread < 10} color="red">
            {unread > 99 ? "99+" : unread}
          </Badge>
        ) : undefined
      }
      aria-label={unread ? `${label}, ${unread} unread` : label}
      data-testid="order-chat"
    >
      {label}
    </Button>
  );
}
