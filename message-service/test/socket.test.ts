import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import Message from "../src/models/message.model.ts";
import SocketServer from "../src/webSocket.ts";
import { ACTIVE_ERRAND, ALICE, BOB, CAROL, COMPLETED_ERRAND, cookieOf, useFakeUserService } from "./helpers/auth.ts";
import { useTestDatabase } from "./helpers/db.ts";

useTestDatabase();
useFakeUserService();

let socketServer: SocketServer;
let url: string;
const open: Socket[] = [];

beforeAll(async () => {
    const server = createApp().listen(0);
    socketServer = new SocketServer(server);
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(() => open.splice(0).forEach((s) => s.close()));
afterAll(() => socketServer.close());

function connect(token?: string): Promise<Socket> {
    const socket = io(url, { extraHeaders: token ? { cookie: cookieOf(token) } : {}, reconnection: false });
    open.push(socket);
    return new Promise((resolve, reject) => {
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", reject);
    });
}

const nextEvent = <T>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));

describe("socket", () => {
    it("refuses a connection without a session cookie", async () => {
        await expect(connect()).rejects.toThrow();
    });

    it("refuses a session the user-service denies", async () => {
        await expect(connect("unknown-token")).rejects.toThrow();
    });

    it("delivers a message to the receiver and ignores a faked sender", async () => {
        const alice = await connect("alice-token");
        const bob = await connect("bob-token");

        const received = nextEvent<{ senderId: string; content: string }>(bob, "receiveMessage");
        const saved = await alice.emitWithAck("sendMessage", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "hi", senderId: CAROL });

        expect(saved.senderId).toBe(ALICE);
        expect(await received).toMatchObject({ senderId: ALICE, content: "hi" });
    });

    it("answers a refused message with a reason", async () => {
        const alice = await connect("alice-token");
        const result = await alice.emitWithAck("sendMessage", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "" });
        expect(result.error.code).toBe("VALIDATION_FAILED");
    });

    it("answers a message on a closed errand with a reason", async () => {
        const alice = await connect("alice-token");
        const result = await alice.emitWithAck("sendMessage", { orderId: COMPLETED_ERRAND, receiverId: BOB, content: "thanks" });
        expect(result.error.code).toBe("CHAT_CLOSED");
    });

    it("marks messages as read and tells the sender once", async () => {
        const alice = await connect("alice-token");
        const bob = await connect("bob-token");
        await alice.emitWithAck("sendMessage", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "hi" });

        const told = nextEvent<{ readerId: string }>(alice, "messagesRead");
        expect(await bob.emitWithAck("markAsRead", { senderId: ALICE })).toEqual({ changed: 1 });
        expect(await told).toEqual({ readerId: BOB });
        expect(await Message.countDocuments({ status: "unread" })).toBe(0);

        // Nothing left to change, so nothing is announced.
        expect(await bob.emitWithAck("markAsRead", { senderId: ALICE })).toEqual({ changed: 0 });
    });

    it("marks only the chat of the given errand as read", async () => {
        await Message.create({ senderId: ALICE, receiverId: BOB, orderId: COMPLETED_ERRAND, content: "old" });
        await Message.create({ senderId: ALICE, receiverId: BOB, orderId: ACTIVE_ERRAND, content: "new" });
        const bob = await connect("bob-token");

        expect(await bob.emitWithAck("markAsRead", { senderId: ALICE, orderId: ACTIVE_ERRAND })).toEqual({ changed: 1 });
        expect(await Message.countDocuments({ status: "unread", orderId: COMPLETED_ERRAND })).toBe(1);
    });
});
