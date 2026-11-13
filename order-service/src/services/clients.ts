import { AppError } from "../errors.ts";

export type SupplierAvailability = { active: boolean; open: boolean };

export type Point = { latitude: number; longitude: number };

// The walk the supplier-service measured from the supplier (from) to the drop-off point. seconds is
// metres at its preset walking speed, and estimated is true when the point is off its walking map.
export type WalkingRoute = { from: Point; metres: number; seconds: number; estimated: boolean };

const isPoint = (value: unknown): value is Point =>
    typeof value === "object" && value !== null &&
    Number.isFinite((value as Point).latitude) && Number.isFinite((value as Point).longitude);

function unavailable(service: "supplier" | "credit"): AppError {
    return new AppError(503, `${service.toUpperCase()}_SERVICE_UNAVAILABLE`, `The ${service} service cannot be reached right now, try again later`);
}

export function createServiceClients(supplierUrl: string, creditUrl: string, request: typeof fetch = fetch) {
    function call(url: URL, cookie: string, timeoutMs: number, init: RequestInit = {}) {
        return request(url, {
            ...init,
            headers: { "content-type": "application/json", cookie },
            signal: AbortSignal.timeout(timeoutMs),
        });
    }

    return {
        // null when the supplier does not exist.
        async supplierAvailability(supplierId: string, at: string, cookie: string): Promise<SupplierAvailability | null> {
            const url = new URL(`/suppliers/${encodeURIComponent(supplierId)}/availability`, supplierUrl);
            url.searchParams.set("at", at);
            let response: Response;
            try {
                response = await call(url, cookie, 2000);
            } catch {
                throw unavailable("supplier");
            }
            if (response.status === 404) return null;
            if (!response.ok) throw unavailable("supplier");
            const body = await response.json().catch(() => null) as { status?: unknown; open?: unknown } | null;
            if (typeof body?.open !== "boolean" || typeof body.status !== "string") throw unavailable("supplier");
            return { active: body.status === "Active", open: body.open };
        },

        // The route is an extra on the errand, so this never fails the creation: anything but a clear
        // answer, a supplier without a map location included, is null.
        async walkingRoute(supplierId: string, to: Point, cookie: string): Promise<WalkingRoute | null> {
            const url = new URL(`/suppliers/${encodeURIComponent(supplierId)}/route`, supplierUrl);
            try {
                const response = await call(url, cookie, 2000, { method: "POST", body: JSON.stringify({ to }) });
                if (!response.ok) return null;
                const body = await response.json() as Partial<WalkingRoute>;
                if (!isPoint(body.from) || !Number.isInteger(body.metres) || !Number.isInteger(body.seconds) ||
                    typeof body.estimated !== "boolean") {
                    return null;
                }
                const { from, metres, seconds, estimated } = body as WalkingRoute;
                return { from: { latitude: from.latitude, longitude: from.longitude }, metres, seconds, estimated };
            } catch {
                return null;
            }
        },

        async reserve(userId: string, errandRef: string, amount: number, cookie: string): Promise<void> {
            let response: Response;
            try {
                response = await call(new URL("/credits/reserve", creditUrl), cookie, 5000, {
                    method: "POST",
                    body: JSON.stringify({ userId, errandRef, amount }),
                });
            } catch (error) {
                if ((error as Error)?.name === "TimeoutError") {
                    throw new AppError(503, "CREDIT_SERVICE_TIMEOUT", "The credit service did not confirm the reservation within 5 seconds, so no errand was created");
                }
                throw unavailable("credit");
            }
            if (response.ok) return;
            // The credit service refuses a reservation with 400 and a plain-text reason.
            if (response.status === 400) {
                const reason = await response.text().catch(() => "");
                if (/insufficient/i.test(reason)) {
                    throw new AppError(409, "INSUFFICIENT_CREDITS", "Your available credits do not cover this reward");
                }
                throw new AppError(409, "CREDIT_RESERVATION_REFUSED", reason || "The credit service refused the reservation");
            }
            throw unavailable("credit");
        },
    };
}
