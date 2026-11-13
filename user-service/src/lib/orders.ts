import { config } from "../config.ts";
import { AppError } from "../errors.ts";

export type ErrandParticipants = { requesterId: string; courierId: string | null };

function unavailable(): AppError {
    return new AppError(503, "ORDER_SERVICE_UNAVAILABLE", "Errands cannot be checked right now, try again later");
}

// Asks the order-service who took part in an errand; null when there is no such errand.
// Anything other than a clear answer within two seconds fails closed.
export async function findErrandParticipants(errandId: string): Promise<ErrandParticipants | null> {
    let response: Response;
    try {
        response = await fetch(new URL(`/internal/orders/${encodeURIComponent(errandId)}`, config.ORDER_SERVICE_URL), {
            signal: AbortSignal.timeout(2000),
        });
    } catch {
        throw unavailable();
    }
    if (response.status === 404) return null;
    if (!response.ok) throw unavailable();

    const body = await response.json().catch(() => null);
    const courierId = body?.courierId;
    if (typeof body?.requesterId !== "string" || (courierId !== null && typeof courierId !== "string")) {
        throw unavailable();
    }
    return { requesterId: body.requesterId, courierId };
}