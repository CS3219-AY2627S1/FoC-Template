import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { socketServer } from "../src/index.ts";
import { ACTIVE_ERRAND, ALICE, BOB, CAROL, COMPLETED_ERRAND, OPEN_ERRAND, cookieOf, orderServiceDown, useFakeUserService, userServiceDown } from "./helpers/auth.ts";
import Message from "../src/models/message.model.ts";
import { useTestDatabase } from "./helpers/db.ts";

useTestDatabase();
useFakeUserService();

const app = createApp();
const send = (token: string, body: object) =>
    request(app).post("/messages/send").set("Cookie", cookieOf(token)).send(body);

describe("authorization", () => {
    it("refuses a request without a session cookie", async () => {
        const res = await request(app).get("/messages/conversations");
        expect(res.status).toBe(401);
    });

    it("refuses a session the user-service denies", async () => {
        const res = await request(app).get("/messages/conversations").set("Cookie", cookieOf("unknown-token"));
        expect(res.status).toBe(403);
    });

    it("refuses when the user-service cannot be reached", async () => {
        userServiceDown();
        const res = await request(app).get("/messages/conversations").set("Cookie", cookieOf("alice-token"));
        expect(res.status).toBe(403);
    });

    it("does not let a third person read a conversation", async () => {
        await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "hi" });
        const res = await request(app).get(`/messages/${ALICE}/${BOB}`).set("Cookie", cookieOf("carol-token"));
        expect(res.status).toBe(403);
    });
});

describe("sending", () => {
    it("saves the message with the logged-in account as sender", async () => {
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "hi bob", senderId: "someone-else" });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ senderId: ALICE, receiverId: BOB, content: "hi bob", status: "unread" });
    });

    it("refuses an empty message", async () => {
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "   " });
        expect(res.status).toBe(400);
    });

    it("refuses a message longer than the limit", async () => {
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "x".repeat(2001) });
        expect(res.status).toBe(400);
    });

    it("answers a body that is not JSON with a JSON error", async () => {
        const res = await request(app)
            .post("/messages/send")
            .set("Cookie", cookieOf("alice-token"))
            .set("content-type", "application/json")
            .send("{not json");
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("INVALID_JSON");
    });

    it("pushes the message to the receiver like the socket does", async () => {
        vi.mocked(socketServer.sendToUser).mockClear();
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "live" });
        expect(socketServer.sendToUser).toHaveBeenCalledWith(BOB, "receiveMessage", expect.objectContaining({ content: "live" }));
        expect(res.status).toBe(201);
    });

    it("refuses a message to Relay", async () => {
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: "0", content: "hello relay" });
        expect(res.status).toBe(400);
    });
});

describe("reading", () => {
    it("returns both directions of a conversation, oldest first", async () => {
        await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "first" });
        await send("bob-token", { orderId: ACTIVE_ERRAND, receiverId: ALICE, content: "second" });

        const res = await request(app).get(`/messages/${ALICE}/${BOB}`).set("Cookie", cookieOf("alice-token"));
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.items.map((m: { content: string }) => m.content)).toEqual(["first", "second"]);
    });

    it("refuses a page below 1", async () => {
        const res = await request(app).get(`/messages/${ALICE}/${BOB}?page=0`).set("Cookie", cookieOf("alice-token"));
        expect(res.status).toBe(400);
    });

    it("lists conversations with the unread count for the reader", async () => {
        await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "one" });
        await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "two" });

        const res = await request(app).get("/messages/conversations").set("Cookie", cookieOf("bob-token"));
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ otherId: ALICE, orderId: ACTIVE_ERRAND, unread: 2, lastMessage: { content: "two" } });
    });

    it("lists one row per errand when two people share several errands", async () => {
        await Message.create({ senderId: ALICE, receiverId: BOB, orderId: COMPLETED_ERRAND, content: "old errand" });
        await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "new errand" });

        const res = await request(app).get("/messages/conversations").set("Cookie", cookieOf("bob-token"));
        expect(res.body.map((c: { orderId: string }) => c.orderId)).toEqual([ACTIVE_ERRAND, COMPLETED_ERRAND]);
    });
});

describe("errand chat", () => {
    it("stores the errand on the message", async () => {
        const res = await send("bob-token", { orderId: ACTIVE_ERRAND, receiverId: ALICE, content: "on my way" });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ orderId: ACTIVE_ERRAND, senderId: BOB, receiverId: ALICE });
    });

    it("refuses a message without an errand", async () => {
        const res = await send("alice-token", { receiverId: BOB, content: "hi" });
        expect(res.status).toBe(400);
    });

    it("refuses someone who is not on the errand, the same way as an unknown errand", async () => {
        const stranger = await send("carol-token", { orderId: ACTIVE_ERRAND, receiverId: ALICE, content: "hi" });
        const unknown = await send("alice-token", { orderId: "999", receiverId: BOB, content: "hi" });
        expect(stranger.status).toBe(403);
        expect(unknown.status).toBe(403);
        expect(unknown.body).toEqual(stranger.body);
    });

    it("refuses a receiver who is not the other person on the errand", async () => {
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: CAROL, content: "hi" });
        expect(res.status).toBe(403);
    });

    it("refuses chatting before a courier has accepted", async () => {
        const res = await send("alice-token", { orderId: OPEN_ERRAND, receiverId: BOB, content: "hi" });
        expect(res.status).toBe(403);
    });

    it("closes the chat once the errand has ended", async () => {
        const res = await send("alice-token", { orderId: COMPLETED_ERRAND, receiverId: BOB, content: "thanks" });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("CHAT_CLOSED");
    });

    it("refuses when the order-service cannot be reached", async () => {
        orderServiceDown();
        const res = await send("alice-token", { orderId: ACTIVE_ERRAND, receiverId: BOB, content: "hi" });
        expect(res.status).toBe(503);
        expect(await Message.countDocuments()).toBe(0);
    });

    it("keeps a closed chat readable for its participants", async () => {
        await Message.create({ senderId: ALICE, receiverId: BOB, orderId: COMPLETED_ERRAND, content: "earlier" });

        const res = await request(app).get(`/messages/orders/${COMPLETED_ERRAND}`).set("Cookie", cookieOf("bob-token"));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ total: 1, open: false, otherId: ALICE });
        expect(res.body.items[0]).toMatchObject({ content: "earlier" });
    });

    it("reports an active chat as open", async () => {
        const res = await request(app).get(`/messages/orders/${ACTIVE_ERRAND}`).set("Cookie", cookieOf("alice-token"));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ total: 0, open: true, otherId: BOB });
    });

    it("does not let a third person read an errand chat", async () => {
        const res = await request(app).get(`/messages/orders/${ACTIVE_ERRAND}`).set("Cookie", cookieOf("carol-token"));
        expect(res.status).toBe(403);
    });
});
