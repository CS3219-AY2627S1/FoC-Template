import config from "../config.ts";
import log from "../log.ts";

export type PickupLookup =
    // the supplier's building and floor, so a supplier pickup fills in the same fields as a building pickup
    { found: true; pickupLocation: string; locationId: number; floor: number | null } |
    { found: false; reason: "NOT_FOUND" | "UNAVAILABLE" };

interface SupplierResponse {
    name: string;
    floor: number | null;
    locationId: number;
}

interface LocationResponse {
    id: number;
    name: string;
}

/**
 * Looks up a live supplier in the supplier service and describes it as a pickup location,
 * e.g. "Printer @ Com 2, Com 2, Level 1".
 *
 * Uses the supplier service's public endpoints, forwarding the requester's own access token.
 * NOT_FOUND covers unknown and soft-deleted suppliers; UNAVAILABLE means the supplier
 * service could not be reached or failed.
 */
export const lookupPickup = async (supplierId: number, authorization: string): Promise<PickupLookup> => {
    const headers = { Authorization: authorization };
    try {
        const supplierRes = await fetch(`${config.supplierServiceUrl}/public/suppliers/${supplierId}`, { headers });
        if (supplierRes.status === 404)
            return { found: false, reason: "NOT_FOUND" };
        if (!supplierRes.ok) {
            log.error(`supplier service returned ${supplierRes.status} for supplier ${supplierId}`);
            return { found: false, reason: "UNAVAILABLE" };
        }
        const supplier = <SupplierResponse>await supplierRes.json();

        // suppliers only store locationId, the building name comes from the locations list
        const locationsRes = await fetch(`${config.supplierServiceUrl}/public/locations`, { headers });
        const locations = locationsRes.ok ? <LocationResponse[]>await locationsRes.json() : [];
        const building = locations.find(l => l.id === supplier.locationId)?.name;

        const parts = [supplier.name, building, supplier.floor === null ? null : formatFloor(supplier.floor)];
        return {
            found: true,
            pickupLocation: parts.filter(p => p).join(", "),
            locationId: supplier.locationId,
            floor: supplier.floor,
        };
    } catch (e) {
        log.error(`supplier service unreachable: ${e}`);
        return { found: false, reason: "UNAVAILABLE" };
    }
};

/**
 * Names of the live buildings (supplier service "locations"), by id.
 * Deleted buildings are left out, so a missing id means not found.
 * Returns null if the supplier service could not be reached or failed.
 */
export const fetchBuildingNames = async (authorization: string): Promise<Map<number, string> | null> => {
    try {
        const res = await fetch(`${config.supplierServiceUrl}/public/locations`, { headers: { Authorization: authorization } });
        if (!res.ok) {
            log.error(`supplier service returned ${res.status} for locations`);
            return null;
        }
        const locations = <LocationResponse[]>await res.json();
        return new Map(locations.map(l => [l.id, l.name]));
    } catch (e) {
        log.error(`supplier service unreachable: ${e}`);
        return null;
    }
};

/** 3 -> "Level 3", -1 -> "B1" (basements); ground floor is Level 1, there is no floor 0 */
export const formatFloor = (floor: number) => floor < 0 ? `B${-floor}` : `Level ${floor}`;

/** A spot in a building as one line, e.g. "Com 2, Level 3, #01-23". */
export const describeBuildingSpot = (building: string, floor: number, room: string | null) =>
    [building, formatFloor(floor), room].filter(p => p).join(", ");
