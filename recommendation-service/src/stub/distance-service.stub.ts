export type Point = { latitude: number; longitude: number };
export type SupplierPoint = Point & { supplierId: string };
export type SupplierDistance = { supplierId: string; distanceMeters: number };

export function estimateDistanceMeters(from: Point, to: Point): number {
    const dLat = to.latitude - from.latitude;
    const dLng = (to.longitude - from.longitude) * Math.cos((from.latitude * Math.PI) / 180);
    return 111_320 * Math.sqrt(dLat * dLat + dLng * dLng);
}

export function rankByDistance(deliveryPoint: Point, suppliers: SupplierPoint[]): SupplierDistance[] {
    return suppliers
        .map((s) => ({ supplierId: s.supplierId, distanceMeters: estimateDistanceMeters(s, deliveryPoint) }))
        .sort((a, b) => b.distanceMeters - a.distanceMeters);
}
