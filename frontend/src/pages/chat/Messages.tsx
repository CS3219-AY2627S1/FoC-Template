// AI-assisted (Claude Opus 5.5): Messages page — chats list plus the open chat;
// side by side on desktop, one at a time on phones. Reviewed by authors.
import { Box, Center, Loader, Paper, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconMessages } from "@tabler/icons-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConversationList } from "../../components/chat/ConversationList";
import { ConversationView } from "../../components/chat/ConversationView";
import { useChat, useOptionalController } from "../../lib/chat/context";
import { orderIdOf } from "../../lib/chat/format";
import { useOrders } from "../../lib/chat/orders";
import type { ChatState } from "../../lib/chat/store";

const EMPTY_CONVS: ChatState["convs"] = {};
// Header (60px) and the AppShell's vertical padding.
const PAGE_HEIGHT = "calc(100dvh - 60px - 2 * var(--mantine-spacing-md))";

function Placeholder({ text, loading = false }: { text: string; loading?: boolean }) {
  return (
    <Center h="100%" p="md">
      <Stack align="center" gap="xs">
        {loading ? <Loader size="sm" /> : <IconMessages size={44} stroke={1.2} />}
        <Text c="dimmed" ta="center">
          {text}
        </Text>
      </Stack>
    </Center>
  );
}

export default function Messages() {
  const { conversationId = null } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const controller = useOptionalController();
  const convs = useChat((s) => s.convs, EMPTY_CONVS);
  const status = useChat((s) => s.status, "connecting");
  const isPhone = useMediaQuery("(max-width: 48em)");
  const exists = Boolean(conversationId && convs[conversationId]);
  const firstSync = status === "connecting" || status === "syncing";

  // Order names/statuses for titles; refetched when an order event lands in the open chat.
  const orderIds = useMemo(() => Object.values(convs).map((c) => orderIdOf(c.conv)), [convs]);
  const lastSystem = conversationId ? convs[conversationId]?.conv.last_message : undefined;
  const orders = useOrders(orderIds, lastSystem?.kind === "system" ? lastSystem.id : "");

  // Messages are marked read only while the chat is on screen and the tab is focused.
  useEffect(() => {
    if (!controller) return;
    controller.setActive(exists ? conversationId : null);
    return () => controller.setActive(null);
  }, [controller, conversationId, exists]);

  useEffect(() => {
    if (!controller) return;
    const update = () =>
      controller.setVisible(document.visibilityState === "visible" && document.hasFocus());
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, [controller]);

  const open = (id: string) => navigate(`/messages/${id}`);
  const list = <ConversationList activeId={conversationId} orders={orders} onOpen={open} />;
  let view;
  if (!controller || (firstSync && !exists)) {
    view = <Placeholder text="Connecting to chat…" loading />;
  } else if (!conversationId) {
    view = <Placeholder text="Select a chat" />;
  } else if (!exists) {
    view = <Placeholder text="This chat does not exist or you are no longer in it." />;
  } else {
    view = (
      <ConversationView
        key={conversationId}
        id={conversationId}
        orders={orders}
        onBack={isPhone ? () => navigate("/messages") : undefined}
      />
    );
  }

  return (
    <Paper withBorder h={PAGE_HEIGHT} style={{ overflow: "hidden", display: "flex" }}>
      {isPhone ? (
        <Box style={{ flex: 1, minWidth: 0 }}>{conversationId ? view : list}</Box>
      ) : (
        <>
          <Box
            w={320}
            style={{
              flexShrink: 0,
              borderRight: "1px solid var(--mantine-color-default-border)",
            }}
          >
            {list}
          </Box>
          <Box style={{ flex: 1, minWidth: 0 }}>{view}</Box>
        </>
      )}
    </Paper>
  );
}
