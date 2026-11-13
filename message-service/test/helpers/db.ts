import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach } from "vitest";
import Message from "../../src/models/message.model.ts";

// Gives the calling test file its own empty database for every test.
export function useTestDatabase(): void {
    let server: MongoMemoryServer;

    beforeAll(async () => {
        server = await MongoMemoryServer.create();
        await mongoose.connect(server.getUri());
        // The unique index for welcome messages must exist before a test relies on it.
        await Message.init();
    });

    beforeEach(async () => {
        await Message.deleteMany({});
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await server.stop();
    });
}
