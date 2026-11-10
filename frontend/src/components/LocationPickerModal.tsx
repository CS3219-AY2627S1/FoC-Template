// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): modal that lets the
// user pick a delivery point on the campus map and resolves its address.
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { formatCoordinates, reverseGeocode } from "../lib/geocoding";
import { CampusMap } from "./CampusMap";

export interface PickedLocation {
  address: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerModalProps {
  opened: boolean;
  onClose: () => void;
  onPick: (location: PickedLocation) => void;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}

// NUS campus centre, used when the supplier has no coordinates.
const CAMPUS_CENTER: [number, number] = [1.296622, 103.776447];

export function LocationPickerModal({
  opened,
  onClose,
  onPick,
  initialLatitude,
  initialLongitude,
}: LocationPickerModalProps) {
  const [latitude, setLatitude] = useState(
    initialLatitude ?? CAMPUS_CENTER[0],
  );
  const [longitude, setLongitude] = useState(
    initialLongitude ?? CAMPUS_CENTER[1],
  );
  const [resolving, setResolving] = useState(false);

  // Reset the pin to the supplier's location every time the modal opens.
  useEffect(() => {
    if (!opened) return;
    setLatitude(initialLatitude ?? CAMPUS_CENTER[0]);
    setLongitude(initialLongitude ?? CAMPUS_CENTER[1]);
  }, [opened, initialLatitude, initialLongitude]);

  async function handleConfirm() {
    setResolving(true);
    const address = await reverseGeocode(latitude, longitude);
    setResolving(false);

    if (!address) {
      notifications.show({
        color: "yellow",
        title: "Address lookup unavailable",
        message:
          "The coordinates were filled in instead. You can edit the address.",
      });
    }

    onPick({
      address: address ?? formatCoordinates(latitude, longitude),
      latitude,
      longitude,
    });
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Pick delivery location"
      size="xl"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Tap or click the map to place the delivery pin, then confirm.
        </Text>

        <CampusMap
          latitude={latitude}
          longitude={longitude}
          selectable
          height={{ base: 280, sm: 380 }}
          onSelect={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
        />

        <Group justify="space-between" wrap="wrap">
          <Text size="sm" c="dimmed">
            {formatCoordinates(latitude, longitude)}
          </Text>
          <Group gap="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} loading={resolving}>
              Use this location
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
