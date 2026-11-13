// Credit does not expose RPC handlers yet. Register Credit-specific handlers
// on this router when adding an RPC endpoint; User's handlers belong in User.
export { RpcRouter, RpcBadRequest } from "../rpc/router.ts";

import type { TransientReplyQueue } from "../transientReplyQueue.ts";

let userReplyQueue: TransientReplyQueue | undefined;

export function setUserReplyQueue(queue: TransientReplyQueue): void {
    userReplyQueue = queue;
}

export async function userExists(userId: number): Promise<boolean> {
    if (!userReplyQueue) throw new Error("User service RPC is unavailable");

    const reply = await userReplyQueue.call("user.query", { userId }) as {
        ok?: boolean;
        result?: { userExists?: boolean };
    } | null;
    // An error response (including DB_ERROR) must not be treated as a missing user.
    if (reply?.ok !== true || typeof reply.result?.userExists !== "boolean") {
        throw new Error("User service lookup failed");
    }
    return reply.result.userExists;
}
