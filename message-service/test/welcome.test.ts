import { beforeEach, describe, expect, it, vi } from "vitest";
import { socketServer } from "../src/index.ts";
import Message, { SYSTEM_SENDER_ID } from "../src/models/message.model.ts";
import { messageUser } from "../src/services/message.service.ts";
import { useTestDatabase } from "./helpers/db.ts";

useTestDatabase();

beforeEach(() => vi.mocked(socketServer.sendToUser).mockClear());

describe("welcome message", () => {
    it("is sent from Relay to the new account", async () => {
        await messageUser("new-account");

        const messages = await Message.find({ receiverId: "new-account" });
        expect(messages).toHaveLength(1);
        expect(messages[0]?.senderId).toBe(SYSTEM_SENDER_ID);
        expect(socketServer.sendToUser).toHaveBeenCalledTimes(1);
    });

    it("is created only once when the event arrives again", async () => {
        // The broker delivers at least once, so the same event can come several times.
        await messageUser("new-account");
        await messageUser("new-account");
        await messageUser("new-account");

        expect(await Message.countDocuments({ receiverId: "new-account" })).toBe(1);
        expect(socketServer.sendToUser).toHaveBeenCalledTimes(1);
    });
});
