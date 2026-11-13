// Live push to connected browsers over WebSockets. The sockets are only used to RECEIVE: the
// server sends JSON frames, and everything the user sends goes through the REST endpoints.
//
// Connections live in this process's memory, so this works with ONE copy of the service. With
// more copies, a message would only reach users connected to the same copy; the fix would be a
// shared bus (e.g. Redis pub/sub or a RabbitMQ fanout) between the copies.
import log from "../log.ts";
import { defaultJwtService } from "../util/jwt.ts";

export interface ChatEvent {
    type: "message" | "chat.opened" | "chat.updated" | "chat.deleted";
    [key: string]: unknown;
}

const sockets = new Map<number, Set<WebSocket>>();

export const isConnected = (userId: number): boolean => (sockets.get(userId)?.size ?? 0) > 0;

export const connectionCount = (): number => {
    let n = 0;
    for (const set of sockets.values()) n += set.size;
    return n;
};

export const sendToUser = (userId: number, event: ChatEvent): void => {
    const set = sockets.get(userId);
    if (!set) return;
    const data = JSON.stringify(event);
    for (const ws of set) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
            ws.send(data);
        } catch (e) {
            log.warn(`could not push ${event.type} to user ${userId}: ${e}`);
        }
    }
};

/** Sends the same event to each distinct, known user. */
export const sendToUsers = (userIds: Array<number | null>, event: ChatEvent): void => {
    for (const id of new Set(userIds))
        if (id !== null) sendToUser(id, event);
};

const unauthorized = (error: string) =>
    new Response(JSON.stringify({ error }), { status: 401, headers: { "Content-Type": "application/json" } });

/**
 * GET /public/ws?token=<access token>. A browser cannot set an Authorization header on a
 * WebSocket, so the token goes in the address. It is checked before the upgrade, and the
 * socket is closed (code 4401) when the token expires, so the app reconnects with a fresh one.
 */
export const handleWebSocket = async (request: Request): Promise<Response> => {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return unauthorized("missing token");

    const result = await defaultJwtService.validateAccessToken(token);
    if (!result.success)
        return unauthorized(result.error === "EXPIRED" ? "access token expired" : "access token is of invalid format");
    const userId = Number(result.payload.sub);
    if (!Number.isInteger(userId)) return unauthorized("access token is of invalid format");

    // idleTimeout: the server pings every 30s and drops a dead connection, and the pings also
    // keep load balancers from closing the connection as idle
    const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 30 });

    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const remove = () => {
        clearTimeout(expiryTimer);
        const set = sockets.get(userId);
        set?.delete(socket);
        if (set?.size === 0) sockets.delete(userId);
    };

    socket.onopen = () => {
        let set = sockets.get(userId);
        if (!set) sockets.set(userId, set = new Set());
        set.add(socket);
        log.info(`WebSocket opened for user ${userId} (${connectionCount()} open)`);
        const exp = typeof result.payload.exp === "number" ? result.payload.exp * 1000 : Date.now() + 15 * 60_000;
        expiryTimer = setTimeout(() => {
            try { socket.close(4401, "token expired"); } catch { /* already closed */ }
        }, Math.max(0, exp - Date.now()));
    };
    socket.onclose = () => {
        remove();
        log.info(`WebSocket closed for user ${userId} (${connectionCount()} open)`);
    };
    socket.onerror = () => remove();
    // nothing is expected from the client; answer a text "ping" so a UI can check the connection
    socket.onmessage = (ev) => {
        if (ev.data === "ping" && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "pong" }));
    };

    return response;
};
