'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import {
  CAMPUS_BOUNDS,
  CAMPUS_CENTER,
  isOnCampus,
  type LatLng,
} from '@/lib/drop-off';

/**
 * Leaflet's default marker loads images by relative URL, which the bundler
 * does not serve, so the pin is drawn in CSS instead.
 */
const pinIcon = L.divIcon({
  className: '',
  html: '<span class="block size-5 rounded-full border-[3px] border-white bg-courier shadow-md"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const bounds = L.latLngBounds(
  [CAMPUS_BOUNDS.minLatitude, CAMPUS_BOUNDS.minLongitude],
  [CAMPUS_BOUNDS.maxLatitude, CAMPUS_BOUNDS.maxLongitude],
);

function toLatLng({ lat, lng }: L.LatLng): LatLng {
  return { latitude: lat, longitude: lng };
}

/** Places the pin on click, and pans to pins set elsewhere (the quick picks). */
function PinControl({
  position,
  onPick,
}: {
  position: LatLng | null;
  onPick: (position: LatLng) => void;
}) {
  const map = useMap();
  useMapEvents({
    click(e) {
      const picked = toLatLng(e.latlng);
      if (isOnCampus(picked)) onPick(picked);
    },
  });

  useEffect(() => {
    if (!position) return;
    const target = L.latLng(position.latitude, position.longitude);
    if (!map.getBounds().contains(target)) map.panTo(target);
  }, [map, position]);

  return null;
}

type DropOffMapProps = {
  position: LatLng | null;
  onPick: (position: LatLng) => void;
};

/** Campus map that sets the drop-off pin by tapping or dragging. */
export default function DropOffMap({ position, onPick }: DropOffMapProps) {
  const center = position ?? CAMPUS_CENTER;

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={16}
      minZoom={14}
      maxBounds={bounds.pad(0.2)}
      maxBoundsViscosity={1}
      className='z-0 h-56 w-full rounded-xl border'
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      />
      <PinControl position={position} onPick={onPick} />
      {position && (
        <Marker
          position={[position.latitude, position.longitude]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend(e) {
              const marker = e.target as L.Marker;
              const picked = toLatLng(marker.getLatLng());
              if (isOnCampus(picked)) onPick(picked);
              // Off campus: put the pin back where it was.
              else marker.setLatLng([position.latitude, position.longitude]);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
