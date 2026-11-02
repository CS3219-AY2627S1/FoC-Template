/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the campus map the new request form picks a drop-off on.
 * Reviewed by Ngooi Jun Sen.
 *
 * Leaflet over OneMap's Night tiles (Singapore Land Authority), which need no
 * key and suit the dark theme. Known drop-off points are dots in the same
 * colour code as the delivery picker; tapping one picks it, tapping anywhere
 * else drops a pin there, and the pin can be dragged. The page decides what a
 * pin means (a known point nearby, a new place, or off campus).
 *
 * The map is pointer-only. The delivery picker above it does everything
 * except place a new pin, so keyboard and screen-reader users are not stuck.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NUS_CAMPUS_AREAS } from '../../lib/campus';
import type { Coordinates } from '../../lib/useGeolocation';
import styles from './DeliveryMap.module.css';

export interface MapPoint extends Coordinates {
  id: string;
  label: string;
  tone: 'accent' | 'info';
}

interface DeliveryMapProps {
  points: MapPoint[];
  /** The picked known point, drawn larger. */
  selectedId: string | null;
  /** Where a new place is, if the user is making one. */
  pin: Coordinates | null;
  onPickPoint: (id: string) => void;
  onDropPin: (at: Coordinates) => void;
}

const TILES = 'https://www.onemap.gov.sg/maps/tiles/Night/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> ' +
  '&copy; contributors &#124; <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

const outlines = NUS_CAMPUS_AREAS.map((area) => area.outline.map(([lat, lng]) => L.latLng(lat, lng)));
const campus = L.latLngBounds(outlines.flat());

const pinIcon = L.divIcon({
  className: styles.pin,
  html: '<span></span>',
  iconSize: [28, 28],
  // The tip of the drawn pin, at the bottom centre.
  iconAnchor: [14, 28],
});

export function DeliveryMap({ points, selectedId, pin, onPickPoint, onDropPin }: DeliveryMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const dots = useRef<L.LayerGroup | null>(null);
  const marker = useRef<L.Marker | null>(null);

  // Leaflet keeps the handlers it was given, so they read the latest props here.
  const handlers = useRef({ onPickPoint, onDropPin });
  handlers.current = { onPickPoint, onDropPin };

  useEffect(() => {
    if (container.current === null) return undefined;
    const instance = L.map(container.current, {
      // Kept to campus: a little slack past the outline, and no zooming out to
      // the rest of Singapore.
      maxBounds: campus.pad(0.3),
      maxBoundsViscosity: 0.8,
      minZoom: 15,
      // OneMap's Night tiles stop at 18; deeper ones come back as one flat colour.
      maxZoom: 18,
    });
    instance.fitBounds(campus);
    L.tileLayer(TILES, {
      minZoom: 11,
      maxZoom: 19,
      // On a high-DPI screen detectRetina asks for one level deeper than the
      // map shows, which at 18 would be a blank 19, and it lowers this layer's
      // maxZoom by one, which would hide it at 18. So the layer allows 19 and
      // the deepest level it asks for there is 17, enlarged.
      maxNativeZoom: L.Browser.retina ? 17 : 18,
      detectRetina: true,
      attribution: ATTRIBUTION,
    }).addTo(instance);
    for (const outline of outlines) {
      L.polygon(outline, { className: styles.outline, interactive: false }).addTo(instance);
    }
    instance.on('click', (event: L.LeafletMouseEvent) =>
      handlers.current.onDropPin({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
    );
    dots.current = L.layerGroup().addTo(instance);
    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      dots.current = null;
      marker.current = null;
    };
  }, []);

  // Redrawn whenever the list or the pick changes; there are only a few dozen.
  useEffect(() => {
    const layer = dots.current;
    if (layer === null) return;
    layer.clearLayers();
    for (const point of points) {
      const selected = point.id === selectedId;
      L.circleMarker([point.latitude, point.longitude], {
        radius: selected ? 9 : 6,
        className: [styles.dot, point.tone === 'info' ? styles.shared : styles.own, selected ? styles.selected : '']
          .filter(Boolean)
          .join(' '),
        bubblingMouseEvents: false,
      })
        .bindTooltip(point.label, { direction: 'top', offset: [0, -6], className: styles.tooltip })
        .on('click', () => handlers.current.onPickPoint(point.id))
        .addTo(layer);
    }
  }, [points, selectedId]);

  // The pin follows the page's state, and dragging it reports back.
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;
    if (pin === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const at = L.latLng(pin.latitude, pin.longitude);
    if (marker.current === null) {
      marker.current = L.marker(at, { icon: pinIcon, draggable: true, keyboard: false })
        .on('dragend', (event) => {
          const moved = (event.target as L.Marker).getLatLng();
          handlers.current.onDropPin({ latitude: moved.lat, longitude: moved.lng });
        })
        .addTo(instance);
    } else {
      marker.current.setLatLng(at);
    }
    if (!instance.getBounds().pad(-0.1).contains(at)) instance.panTo(at);
  }, [pin]);

  // Bring a point picked from the list into view.
  useEffect(() => {
    const instance = map.current;
    const point = points.find((candidate) => candidate.id === selectedId);
    if (instance === null || point === undefined) return;
    const at = L.latLng(point.latitude, point.longitude);
    if (!instance.getBounds().pad(-0.1).contains(at)) instance.panTo(at);
  }, [points, selectedId]);

  return (
    <div className={styles.frame}>
      <div ref={container} className={styles.map} aria-label="Campus map of drop-off points" role="region" />
      <p className={styles.legend}>
        <span className={`${styles.key} ${styles.keyOwn}`} aria-hidden="true" />
        Your places
        <span className={`${styles.key} ${styles.keyShared}`} aria-hidden="true" />
        Around campus
        <span className={styles.legendNote}>Tap a dot to pick it, or anywhere inside the outline for a new place.</span>
      </p>
    </div>
  );
}

export default DeliveryMap;
