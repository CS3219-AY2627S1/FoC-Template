// AI-assisted (Claude Opus 5.5): message composer with replies, photos and location
// sharing, ported from the standalone chat demo. Reviewed by authors.
import { ActionIcon, Box, CloseButton, Group, Text, Textarea, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMapPin, IconPhoto, IconSend } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { ApiError, chatApi } from "../../lib/api";
import { PHOTO_TYPES, photoProblem } from "../../lib/chat/photos";
import type { PendingMessage } from "../../lib/chat/store";
import type { ChatMessage } from "../../lib/chat/types";

type Content = Pick<PendingMessage, "kind" | "body" | "payload" | "reply_to_id">;

interface Props {
  conversationId: string;
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
  disabled,
  replyTo,
  replyName,
  onCancelReply,
  onSend,
  onTyping,
}: Props) {
  const [text, setText] = useState("");
  const [locating, setLocating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
    if (!body || disabled) return;
    onSend({ kind: "text", body, payload: null, reply_to_id: reply });
    setText("");
    onCancelReply();
  };

  const shareLocation = () => {
    if (!navigator.geolocation) {
      notifications.show({ color: "red", message: "This browser cannot share a location." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSend({
          kind: "location",
          body: null,
          payload: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "My location" },
          reply_to_id: reply,
        });
        onCancelReply();
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
        <Tooltip label="Share my location">
          <ActionIcon
            variant="subtle"
            size="lg"
            disabled={disabled}
            loading={locating}
            onClick={shareLocation}
            aria-label="Share my location"
          >
            <IconMapPin size={18} />
          </ActionIcon>
        </Tooltip>
        <Textarea
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
          disabled={disabled || !text.trim()}
          aria-label="Send"
          data-testid="send"
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Box>
  );
}
