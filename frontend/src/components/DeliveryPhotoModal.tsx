// AI-INFLUENCED: Require a courier photo before submitting delivery through the gateway with Codex.
import { Button, FileInput, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState, type FormEvent } from "react";
import { ApiError, ordersApi } from "../lib/api";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoError(photo: File | null): string | undefined {
  if (!photo) return undefined;
  if (!PHOTO_TYPES.has(photo.type)) return "Choose a JPEG, PNG, or WebP photo.";
  if (!photo.size) return "Choose a non-empty photo.";
  if (photo.size > MAX_PHOTO_BYTES) return "The photo must be 5 MiB or smaller.";
  return undefined;
}

export function DeliveryPhotoModal({
  orderId,
  onClose,
  onDelivered,
}: {
  orderId: string | null;
  onClose: () => void;
  onDelivered: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const error = photoError(photo);

  function close() {
    if (submitting) return;
    setPhoto(null);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderId || !photo || error) return;
    setSubmitting(true);
    try {
      await ordersApi.deliver(orderId, photo);
      setPhoto(null);
      onClose();
      onDelivered();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Deliver failed",
        message: err instanceof ApiError ? err.message : "Failed to deliver",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal opened={orderId !== null} onClose={close} title="Proof of delivery">
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="sm">Add a photo before marking this order delivered.</Text>
          <FileInput
            label="Delivery photo"
            description="JPEG, PNG, or WebP; up to 5 MiB"
            accept="image/jpeg,image/png,image/webp"
            value={photo}
            onChange={setPhoto}
            error={error}
            required
            clearable
          />
          <Button type="submit" loading={submitting} disabled={!photo || Boolean(error)}>
            Mark delivered
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
