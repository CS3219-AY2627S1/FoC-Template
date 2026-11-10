// AI-assisted (Claude Opus 5.5): message composer with replies, photos and location
// sharing, ported from the standalone chat demo. Reviewed by authors.
// UI tweaks (Claude Opus 5.5): quick replies above the input; location is attached
// from a quick reply and only sent with the message. Reviewed by authors.
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CloseButton,
  Group,
  ScrollArea,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMapPin, IconPhoto, IconSend } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { ApiError, chatApi } from "../../lib/api";
import { PHOTO_TYPES, photoProblem } from "../../lib/chat/photos";
import type { PendingMessage } from "../../lib/chat/store";
import type { ChatMessage } from "../../lib/chat/types";

type Content = Pick<PendingMessage, "kind" | "body" | "payload" | "reply_to_id">;

/** The signed-in user's role in an order chat, from its member label. */
export type ChatRole = "requester" | "courier" | null;

const QUICK_REPLIES: Record<"requester" | "courier" | "other", string[]> = {
  requester: ["Hi!", "How long more?", "Where are you now?", "Thanks!"],
  courier: [
    "Hi, I've got your order!",
    "On my way to the vendor",
    "Picked it up, heading over",
    "Where should I meet you?",
  ],
  other: ["Hi!", "Where are you now?", "Thanks!"],
};

const LOCATION_TEXT = "Here's my location";

interface Coords {
  lat: number;
  lng: number;
}

interface Props {
  conversationId: string;
  role?: ChatRole;
  disabled: boolean;
  replyTo: ChatMessage | null;
  replyName: string;
  onCancelReply: () => void;
  onSend: (content: Content) => void;
  onTyping: () => void;
}

const MAX_LENGTH = 4000;

export function Composer({
  conversationId,
  role = null,
  disabled,
  replyTo,
  replyName,
  onCancelReply,
  onSend,
  onTyping,
}: Props) {
  const [text, setText] = useState("");
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<Coords | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const quickReplies = QUICK_REPLIES[role ?? "other"];

  /** Put a quick reply in the box so it can be edited; nothing is sent yet. */
  const applyQuickReply = (reply: string) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${reply}` : reply));
    onTyping();
    textInput.current?.focus();
  };
  const reply = replyTo?.id ?? null;

  /** Upload the picked photo, then send it; the typed text becomes its caption. */
  const sendPhoto = async (file: File) => {
    const problem = photoProblem(file);
    if (problem) {
      notifications.show({ color: "red", message: problem });
      return;
    }
    setUploading(true);
    try {
      const photo = await chatApi.uploadPhoto(conversationId, file);
      onSend({
        kind: "image",
        body: text.trim() || null,
        payload: { attachment_id: photo.attachment_id },
        reply_to_id: reply,
      });
      setText("");
      onCancelReply();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Photo not sent",
        message: err instanceof ApiError ? err.message : "Upload failed. Try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const body = text.trim();
    if (disabled || (!body && !location)) return;
    if (location) {
      // One message: the map link plus whatever was typed.
      onSend({
        kind: "location",
        body: body || null,
        payload: { lat: location.lat, lng: location.lng, label: "My location" },
        reply_to_id: reply,
      });
      setLocation(null);
    } else {
      onSend({ kind: "text", body, payload: null, reply_to_id: reply });
    }
    setText("");
    onCancelReply();
  };

  /** Attach the current location to the next message (it is sent with Send). */
  const attachLocation = () => {
    if (!navigator.geolocation) {
      notifications.show({ color: "red", message: "This browser cannot share a location." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setText((prev) => (prev.trim() ? prev : LOCATION_TEXT));
        textInput.current?.focus();
      },
      () => {
        setLocating(false);
        notifications.show({ color: "red", message: "Location permission was denied." });
      },
      { timeout: 10_000 },
    );
  };

  return (
    <Box p="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
      {replyTo && (
        <Group
          justify="space-between"
          mb={6}
          pl={8}
          wrap="nowrap"
          style={{ borderLeft: "3px solid var(--mantine-color-brand-5)" }}
        >
          <div style={{ minWidth: 0 }}>
            <Text size="xs" fw={600}>
              Replying to {replyName}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {replyTo.body ?? replyTo.kind}
            </Text>
          </div>
          <CloseButton size="sm" onClick={onCancelReply} aria-label="Cancel reply" />
        </Group>
      )}
      {!disabled && (
        <ScrollArea type="never" mb={6} data-testid="quick-replies">
          <Group gap={6} wrap="nowrap">
            {quickReplies.map((q) => (
              <Button
                key={q}
                size="compact-xs"
                radius="xl"
                variant="light"
                color="gray"
                onClick={() => applyQuickReply(q)}
                style={{ flexShrink: 0 }}
              >
                {q}
              </Button>
            ))}
            <Button
              size="compact-xs"
              radius="xl"
              variant="light"
              leftSection={<IconMapPin size={12} />}
              loading={locating}
              disabled={Boolean(location)}
              onClick={attachLocation}
              style={{ flexShrink: 0 }}
            >
              {LOCATION_TEXT}
            </Button>
          </Group>
        </ScrollArea>
      )}
      {location && (
        <Group gap={4} mb={6}>
          <Badge
            variant="light"
            tt="none"
            leftSection={<IconMapPin size={12} />}
            rightSection={
              <CloseButton
                size="xs"
                variant="transparent"
                onClick={() => setLocation(null)}
                aria-label="Remove location"
              />
            }
            data-testid="location-attachment"
          >
            Current location attached
          </Badge>
          <Text size="xs" c="dimmed">
            Sent with your message
          </Text>
        </Group>
      )}
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <input
          ref={fileInput}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          hidden
          data-testid="photo-input"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = ""; // picking the same file again still fires
            if (file) void sendPhoto(file);
          }}
        />
        <Tooltip label="Send a photo">
          <ActionIcon
            variant="subtle"
            size="lg"
            disabled={disabled}
            loading={uploading}
            onClick={() => fileInput.current?.click()}
            aria-label="Send a photo"
          >
            <IconPhoto size={18} />
          </ActionIcon>
        </Tooltip>
        <Textarea
          ref={textInput}
          style={{ flex: 1 }}
          autosize
          minRows={1}
          maxRows={5}
          placeholder={disabled ? "This chat is read-only" : "Message"}
          aria-label="Message"
          value={text}
          disabled={disabled}
          maxLength={MAX_LENGTH}
          data-testid="composer"
          onChange={(e) => {
            setText(e.currentTarget.value);
            if (e.currentTarget.value) onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <ActionIcon
          size="lg"
          onClick={submit}
          disabled={disabled || (!text.trim() && !location)}
          aria-label="Send"
          data-testid="send"
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Box>
  );
}
