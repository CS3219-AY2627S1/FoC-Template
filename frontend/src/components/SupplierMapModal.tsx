// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): read-only supplier
// location modal using the same map style as the order location picker.
import { Alert, Modal, Stack, Text } from "@mantine/core";
import type { Supplier } from "../lib/types";
import { CampusMap } from "./CampusMap";

interface SupplierMapModalProps {
  opened: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}

const MODAL_MAP_HEIGHT = { base: 280, sm: 380 };

export function SupplierMapModal({
  opened,
  onClose,
  supplier,
}: SupplierMapModalProps) {
  const latitude = supplier?.latitude ?? null;
  const longitude = supplier?.longitude ?? null;
  const location = [
    supplier?.building,
    supplier?.floor,
    supplier?.locationDescription,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Modal
      opened={opened && supplier != null}
      onClose={onClose}
      title="Supplier location"
      size="xl"
      centered
    >
      {supplier ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {location || supplier.name}
          </Text>

          {latitude != null && longitude != null ? (
            <CampusMap
              latitude={latitude}
              longitude={longitude}
              label={supplier.name}
              height={MODAL_MAP_HEIGHT}
            />
          ) : (
            <Alert color="yellow" title="No location yet">
              This supplier has no coordinates, so it cannot be shown on the
              map.
            </Alert>
          )}
        </Stack>
      ) : null}
    </Modal>
  );
}
