// AI-assisted (Claude Opus 5.5): a photo in a chat message; tap to view it full size.
// Reviewed by authors.
import { Center, Image, Modal, Skeleton, Text, UnstyledButton } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { useState } from "react";
import { usePhoto } from "../../lib/chat/photos";
import type { ImagePayload } from "../../lib/chat/types";

const MAX_W = 240;
const MAX_H = 260;

export function ChatPhoto({
  conversationId,
  payload,
}: {
  conversationId: string;
  payload: ImagePayload;
}) {
  const { url, error } = usePhoto(conversationId, payload.attachment_id);
  const [open, setOpen] = useState(false);
  // Reserve the photo's shape while it loads, so the chat does not jump.
  const w = payload.width ?? MAX_W;
  const h = payload.height ?? MAX_W;
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  const box = { width: Math.round(w * scale), height: Math.round(h * scale) };

  if (error) {
    return (
      <Center style={{ ...box, background: "var(--mantine-color-gray-1)", borderRadius: 6 }}>
        <Text size="xs" c="dimmed" ta="center">
          <IconPhotoOff size={18} />
          <br />
          Photo unavailable
        </Text>
      </Center>
    );
  }
  if (!url) return <Skeleton {...box} radius="sm" data-testid="photo-loading" />;
  return (
    <>
      <UnstyledButton onClick={() => setOpen(true)} aria-label="View photo" display="block">
        <Image src={url} alt="Photo" radius="sm" {...box} fit="cover" data-testid="chat-photo" />
      </UnstyledButton>
      <Modal opened={open} onClose={() => setOpen(false)} size="auto" centered withCloseButton>
        <Image src={url} alt="Photo" mah="80vh" maw="90vw" fit="contain" />
      </Modal>
    </>
  );
}
