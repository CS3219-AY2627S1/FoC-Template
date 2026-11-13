import { beforeEach, vi } from "vitest";

export const ALICE = "alice-id";
export const BOB = "bob-id";
export const CAROL = "carol-id";

// Session tokens the fake user-service knows. Any other token is denied.
const sessions: Record<string, string> = {
    "alice-token": ALICE,
    "bob-token": BOB,
    "carol-token": CAROL,
};

// Errands the fake order-service knows. Alice requested them all, Bob is the courier where there is one.
export const ACTIVE_ERRAND = "1";
export const COMPLETED_ERRAND = "2";
export const OPEN_ERRAND = "3";
const errands: Record<string, { requesterId: string; courierId: string | null; status: string }> = {
    [ACTIVE_ERRAND]: { requesterId: ALICE, courierId: BOB, status: "PickedUp" },
    [COMPLETED_ERRAND]: { requesterId: ALICE, courierId: BOB, status: "Completed" },
    [OPEN_ERRAND]: { requesterId: ALICE, courierId: null, status: "Open" },
};

export const cookieOf = (token: string) => `relay_session=${token}`;

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Answers POST /internal/authorize like the user-service and GET /internal/orders/:id like the
// order-service, so neither needs to run.
export function useFakeUserService(): void {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
            const order = /\/internal\/orders\/([^/]+)$/.exec(url);
            if (order) {
                const errand = errands[decodeURIComponent(order[1]!)];
                return errand ? json({ id: order[1], ...errand }) : json({ error: "ORDER_NOT_FOUND" }, 404);
            }

            const { token } = JSON.parse(init!.body);
            const accountId = sessions[token];
            return json(accountId ? { decision: "authorized", accountId, roles: ["member"] } : { decision: "denied" });
        }));
    });
}

// The user-service is down or unreachable.
export function userServiceDown(): void {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));
}

// The user-service answers, the order-service does not.
export function orderServiceDown(): void {
    const answer = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body: string }) => {
        if (url.includes("/internal/orders/")) throw new Error("connect ECONNREFUSED");
        return answer(url, init as RequestInit);
    }));
}
