// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): modal that lets the
// user pick a delivery point on the campus map and resolves its address.
import {
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
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
const PICKER_MAP_HEIGHT = { base: 280, sm: 380 };
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 0,
};

function geolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission was denied.";
    case error.POSITION_UNAVAILABLE:
      return "Your current location is unavailable.";
    case error.TIMEOUT:
      return "Timed out while getting your current location.";
    default:
      return "Could not access your current location.";
  }
}

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
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Each time the modal opens, ask the browser for the current position first.
  // On success that becomes the default pin; otherwise fall back to the
  // supplier location (or the campus centre) as before.
  useEffect(() => {
    if (!opened) return;

    setLatitude(initialLatitude ?? CAMPUS_CENTER[0]);
    setLongitude(initialLongitude ?? CAMPUS_CENTER[1]);
    setAccuracy(null);
    setGeoError(null);

    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported by this browser.");
      return;
    }

    let cancelled = false;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setAccuracy(position.coords.accuracy);
        setLocating(false);
      },
      (error) => {
        if (cancelled) return;
        setGeoError(geolocationErrorMessage(error));
        setLocating(false);
      },
      GEOLOCATION_OPTIONS,
    );

    return () => {
      cancelled = true;
    };
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

  const hint = locating
    ? null
    : accuracy != null
      ? `Using your current location (accuracy ±${Math.round(accuracy)} m). Click the map to adjust.`
      : `${geoError ?? "Click the map to place the delivery pin."} Click the map to adjust.`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Pick delivery location"
      size="xl"
      centered
    >
      <Stack gap="md">
        {locating ? (
          <Center h={PICKER_MAP_HEIGHT}>
            <Stack align="center" gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Getting your current location…
              </Text>
            </Stack>
          </Center>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
            <CampusMap
              latitude={latitude}
              longitude={longitude}
              selectable
              height={PICKER_MAP_HEIGHT}
              onSelect={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
          </>
        )}

        <Group justify="space-between" wrap="wrap">
          <Text size="sm" c="dimmed">
            {formatCoordinates(latitude, longitude)}
          </Text>
          <Group gap="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              loading={resolving}
              disabled={locating}
            >
              Use this location
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
