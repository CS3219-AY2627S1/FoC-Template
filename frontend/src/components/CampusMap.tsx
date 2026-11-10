// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): reusable Leaflet +
// OpenStreetMap view centered on a campus location. Reviewed by authors.
import { ActionIcon, Box, Text, Tooltip } from "@mantine/core";
import { IconFocusCentered } from "@tabler/icons-react";
import { divIcon, DomEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

interface CampusMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  /** When true, clicking the map reports the clicked coordinates via onSelect. */
  selectable?: boolean;
  onSelect?: (latitude: number, longitude: number) => void;
  /** Responsive map height; defaults to the full-height map view. */
  height?: { base: number; sm: number };
}

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_ZOOM = 17;

// Overlay control that re-centers the map on the supplier and restores the
// default zoom level.
function RecenterControl({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep clicks on the control from reaching the map (which would move the
  // selection pin in selectable mode).
  useEffect(() => {
    if (containerRef.current) {
      DomEvent.disableClickPropagation(containerRef.current);
    }
  }, []);

  return (
    <Box
      ref={containerRef}
      style={{ position: "absolute", top: 10, right: 10, zIndex: 1000 }}
    >
      <Tooltip label="Recenter map" withArrow>
        <ActionIcon
          aria-label="Recenter map"
          variant="default"
          size="lg"
          radius="md"
          onClick={() =>
            map.setView([latitude, longitude], DEFAULT_ZOOM, { animate: true })
          }
        >
          <IconFocusCentered size={18} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

// Reports map clicks so a parent can move a selection pin.
function ClickToSelect({
  onSelect,
}: {
  onSelect: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

// Leaflet measures its container on mount; inside modals the layout may settle
// a moment later, so re-measure once to avoid grey/torn tiles.
function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

// Red teardrop pin drawn as inline SVG so no extra image assets are needed.
// iconAnchor points at the bottom tip, so the tip marks the exact coordinate.
const RED_PIN_ICON = divIcon({
  className: "campus-map-pin",
  html: `<svg width="30" height="45" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0Z" fill="#e03131"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>`,
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -40],
});

export function CampusMap({
  latitude,
  longitude,
  label,
  selectable = false,
  onSelect,
  height = { base: 360, sm: 520 },
}: CampusMapProps) {
  // Explicit tuple so Leaflet's LatLngExpression type narrows correctly.
  const position: [number, number] = [latitude, longitude];

  return (
    <Box
      h={height}
      w="100%"
      style={{
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
        border: "1px solid var(--mantine-color-gray-3)",
      }}
    >
      <MapContainer
        center={position}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        style={{
          height: "100%",
          width: "100%",
          cursor: selectable ? "crosshair" : undefined,
        }}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        {selectable && onSelect ? <ClickToSelect onSelect={onSelect} /> : null}
        <Marker position={position} icon={RED_PIN_ICON}>
          {label ? (
            <Popup>
              <Text size="sm" fw={600}>
                {label}
              </Text>
            </Popup>
          ) : null}
        </Marker>
        <RecenterControl latitude={latitude} longitude={longitude} />
        <InvalidateSizeOnMount />
      </MapContainer>
    </Box>
  );
}
