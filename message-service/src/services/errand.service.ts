import { config } from "../config.ts";
import { AppError } from "../errors.ts";

const TIMEOUT_MS = 2000;

// A chat opens when a courier accepts and closes once the errand has ended. Earlier messages stay readable.
export const CHAT_OPEN_STATUSES = ["Accepted", "PickedUp", "Delivered"] as const;

type Errand = { requesterId: string; courierId: string | null; status: string };

// The order-service is the authority on who is on an errand, so it is asked every time instead of keeping a copy.
async function fetchErrand(orderId: string): Promise<Errand | null> {
    let response: Response;
    try {
        response = await fetch(`${config.ORDER_SERVICE_URL}/internal/orders/${encodeURIComponent(orderId)}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch {
        throw unavailable();
    }
    if (response.status === 404) return null;
    if (!response.ok) throw unavailable();

    try {
        return (await response.json()) as Errand;
    } catch {
        throw unavailable();
    }
}

function unavailable() {
    return new AppError(503, "ORDER_SERVICE_UNAVAILABLE", "The errand could not be checked, try again later");
}

function forbidden() {
    return new AppError(403, "FORBIDDEN", "You are not allowed to do this");
}

// Resolves when accountId is the requester or courier of the errand, and otherId (if given) is the other one.
// A missing errand and someone else's errand get the same refusal, so the answer does not reveal which it was.
export async function checkErrandParticipant(orderId: string, accountId: string, otherId?: string) {
    const errand = await fetchErrand(orderId);
    if (!errand || !errand.courierId) throw forbidden();

    const { requesterId, courierId } = errand;
    const counterpart = accountId === requesterId ? courierId : accountId === courierId ? requesterId : null;
    if (!counterpart || (otherId !== undefined && otherId !== counterpart)) throw forbidden();

    return { counterpart, open: (CHAT_OPEN_STATUSES as readonly string[]).includes(errand.status) };
}

export async function checkCanChat(orderId: string, senderId: string, receiverId: string) {
    const { open } = await checkErrandParticipant(orderId, senderId, receiverId);
    if (!open) {
        throw new AppError(409, "CHAT_CLOSED", "Chatting is only possible while a courier is on the errand");
    }
}
