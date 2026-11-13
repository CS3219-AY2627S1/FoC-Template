import config from "../config.ts";
import log from "../log.ts";

// the supplier fields a bookmark shows
export interface SupplierDetails {
    id: number;
    name: string;
    type: string[];
    floor: number | null;
    locationId: number;
    imageUrl: string | null;
    opensAt: string | null;
    closesAt: string | null;
}

export interface LocationDetails {
    id: number;
    name: string;
}

/**
 * GONE: the supplier service answered that it does not exist (deleted or unknown), so a bookmark of it can go.
 * UNAVAILABLE: no clear answer (unreachable, timed out or failed), so nothing may be deleted on it.
 */
export type Lookup<T> = { status: "FOUND"; value: T } | { status: "GONE" } | { status: "UNAVAILABLE" };

// supplier service calls fail fast so a slow supplier service does not hold up the bookmarks
const TIMEOUT_MS = 3000;

/**
 * Looks up a live supplier through the supplier service's public endpoint,
 * forwarding the user's own access token.
 */
export const lookupSupplier = async (id: number, authorization: string): Promise<Lookup<SupplierDetails>> => {
    try {
        const res = await fetch(`${config.supplierServiceUrl}/public/suppliers/${id}`, {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404)
            return { status: "GONE" };
        if (!res.ok) {
            log.error(`supplier service returned ${res.status} for supplier ${id}`);
            return { status: "UNAVAILABLE" };
        }
        const s = <SupplierDetails>await res.json();
        return {
            status: "FOUND",
            value: {
                id: s.id, name: s.name, type: s.type, floor: s.floor, locationId: s.locationId,
                imageUrl: s.imageUrl, opensAt: s.opensAt, closesAt: s.closesAt,
            },
        };
    } catch (e) {
        log.error(`supplier service unreachable: ${e}`);
        return { status: "UNAVAILABLE" };
    }
};

/**
 * The live buildings (supplier service "locations"), by id. Deleted ones are left out,
 * so a missing id means gone. null if the supplier service could not be reached or failed.
 */
export const fetchLocations = async (authorization: string): Promise<Map<number, LocationDetails> | null> => {
    try {
        const res = await fetch(`${config.supplierServiceUrl}/public/locations`, {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
            log.error(`supplier service returned ${res.status} for locations`);
            return null;
        }
        const locations = <LocationDetails[]>await res.json();
        return new Map(locations.map(l => [l.id, { id: l.id, name: l.name }]));
    } catch (e) {
        log.error(`supplier service unreachable: ${e}`);
        return null;
    }
};
