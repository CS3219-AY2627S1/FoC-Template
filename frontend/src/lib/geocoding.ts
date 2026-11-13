// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): reverse geocoding
// through the public OSM Nominatim service, with a coordinate fallback.
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

/** Formats raw coordinates for display or as an address fallback. */
export function formatCoordinates(
  latitude: number,
  longitude: number,
): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/**
 * Looks up a human-readable address for a point. Returns null when the service
 * is unavailable, rate limited, or returns no address so callers can fall back
 * to {@link formatCoordinates}.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", latitude.toFixed(6));
  url.searchParams.set("lon", longitude.toFixed(6));
  url.searchParams.set("zoom", "18");
  // Nominatim follows the browser's Accept-Language header by default, which
  // yields localized names (e.g. Chinese). Pin the lookup to English so the
  // delivery address stays consistent regardless of the user's locale.
  url.searchParams.set("accept-language", "en");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Accept-Language": "en" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { display_name?: unknown };
    return typeof data.display_name === "string" && data.display_name.length > 0
      ? data.display_name
      : null;
  } catch {
    return null;
  }
}
