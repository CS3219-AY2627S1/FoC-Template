// AI-assisted (Claude Opus 5.5): one chat message with receipts and actions,
// ported from the standalone chat demo. Reviewed by authors.
import { ActionIcon, Anchor, Box, Group, Menu, Paper, Text, Tooltip } from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowBackUp,
  IconCheck,
  IconChecks,
  IconClock,
  IconDots,
  IconEdit,
  IconFile,
  IconMapPin,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { formatTime, renderSystem } from "../../lib/chat/format";
import type { PendingMessage } from "../../lib/chat/store";
import type { ChatMessage, ImagePayload } from "../../lib/chat/types";
import { ChatPhoto } from "./ChatPhoto";

export type Tick = "pending" | "failed" | "sent" | "delivered" | "read";

const TICK_LABEL: Record<Tick, string> = {
  pending: "Sending",
  failed: "Failed",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

function TickIcon({ tick }: { tick: Tick }) {
  const props = { size: 15, "aria-label": TICK_LABEL[tick], "data-tick": tick } as const;
  switch (tick) {
    case "pending":
      return <IconClock {...props} />;
    case "failed":
      return <IconAlertCircle {...props} color="var(--mantine-color-red-6)" />;
    case "sent":
      return <IconCheck {...props} />;
    case "delivered":
      return <IconChecks {...props} />;
    case "read":
      return <IconChecks {...props} color="var(--mantine-color-blue-5)" />;
  }
}

export function SystemLine({
  message,
  nameOf,
}: {
  message: ChatMessage;
  nameOf: (id: string) => string;
}) {
  return (
    <Group justify="center" my={6} data-testid="system-message">
      <Text
        size="xs"
        c="dimmed"
        px="sm"
        py={2}
        ta="center"
        style={{ background: "var(--mantine-color-gray-1)", borderRadius: 12 }}
      >
        {renderSystem(message.payload, nameOf)} · {formatTime(message.created_at)}
      </Text>
    </Group>
  );
}

function Content({ m }: { m: ChatMessage | PendingMessage }) {
  if ("deleted_at" in m && m.deleted_at) {
    return (
      <Text size="sm" fs="italic" c="dimmed">
        This message was deleted
      </Text>
    );
  }
  const payload = (m.payload ?? {}) as Record<string, string | number | undefined>;
  return (
    <>
      {m.kind === "image" && (
        <div style={{ marginBottom: m.body ? 4 : 0 }}>
          <ChatPhoto
            conversationId={m.conversation_id}
            payload={(m.payload ?? {}) as unknown as ImagePayload}
          />
        </div>
      )}
      {m.kind === "file" && payload.url && (
        <Anchor href={String(payload.url)} target="_blank" rel="noreferrer" size="sm">
          <Group gap={4}>
            <IconFile size={16} /> {payload.name ?? "Download file"}
          </Group>
        </Anchor>
      )}
      {m.kind === "location" && (
        <Anchor
          href={`https://www.google.com/maps?q=${payload.lat},${payload.lng}`}
          target="_blank"
          rel="noreferrer"
          size="sm"
        >
          <Group gap={4}>
            <IconMapPin size={16} /> {payload.label ?? `${payload.lat}, ${payload.lng}`}
          </Group>
        </Anchor>
      )}
      {m.body && (
        <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {m.body}
        </Text>
      )}
    </>
  );
}

interface Props {
  message: ChatMessage | PendingMessage;
  mine: boolean;
  senderName?: string;
  tick?: Tick;
  replyTo?: ChatMessage | null;
  replyName?: string;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onDiscard?: () => void;
  error?: string;
}

export function MessageBubble(props: Props) {
  const { message: m, mine, tick } = props;
  const isSent = "id" in m;
  const deleted = isSent && Boolean(m.deleted_at);
  const canEdit = mine && isSent && !deleted && m.kind === "text" && props.onEdit;

  return (
    <Group
      justify={mine ? "flex-end" : "flex-start"}
      my={4}
      wrap="nowrap"
      align="flex-start"
      data-testid="message"
      data-mine={mine}
    >
      <Paper
        px="sm"
        py={6}
        maw="78%"
        withBorder={!mine}
        style={{
          background: mine ? "var(--mantine-color-brand-light)" : "var(--mantine-color-body)",
          opacity: tick === "pending" ? 0.75 : 1,
        }}
      >
        {props.senderName && !mine && (
          <Text size="xs" fw={600} c="brand">
            {props.senderName}
          </Text>
        )}
        {props.replyTo !== undefined && (
          <Box mb={4} pl={6} style={{ borderLeft: "3px solid var(--mantine-color-brand-5)" }}>
            <Text size="xs" fw={600}>
              {props.replyName ?? ""}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {props.replyTo
                ? props.replyTo.deleted_at
                  ? "Deleted message"
                  : (props.replyTo.body ?? props.replyTo.kind)
                : "Earlier message"}
            </Text>
          </Box>
        )}
        <Content m={m} />
        <Group gap={4} justify="flex-end" mt={2} wrap="nowrap">
          {isSent && m.edited_at && !deleted && (
            <Text size="xs" c="dimmed">
              edited
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {formatTime(m.created_at)}
          </Text>
          {mine && tick && (
            <Tooltip label={props.error ?? TICK_LABEL[tick]}>
              <span style={{ display: "inline-flex" }} data-testid="tick" data-tick={tick}>
                <TickIcon tick={tick} />
              </span>
            </Tooltip>
          )}
        </Group>
      </Paper>
      {tick === "failed" ? (
        <Group gap={2}>
          <Tooltip label="Retry">
            <ActionIcon size="sm" variant="subtle" onClick={props.onRetry} aria-label="Retry">
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Discard">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={props.onDiscard}
              aria-label="Discard"
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ) : (
        isSent &&
        !deleted &&
        (props.onReply || canEdit || (mine && props.onDelete)) && (
          <Menu position={mine ? "bottom-end" : "bottom-start"} withinPortal>
            <Menu.Target>
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Message actions">
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {props.onReply && (
                <Menu.Item leftSection={<IconArrowBackUp size={14} />} onClick={props.onReply}>
                  Reply
                </Menu.Item>
              )}
              {canEdit && (
                <Menu.Item leftSection={<IconEdit size={14} />} onClick={props.onEdit}>
                  Edit
                </Menu.Item>
              )}
              {mine && props.onDelete && (
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={props.onDelete}
                >
                  Delete
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )
      )}
    </Group>
  );
}
