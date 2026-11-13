import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { ReportModel } from "../../src/models/report.model.ts";
import { SessionModel } from "../../src/models/session.model.ts";
import { UserModel } from "../../src/models/user.model.ts";

// mongodb-memory-server checks for a free port on "::", which on macOS passes for a port another
// process holds on 127.0.0.1, where mongod then fails to start. So the port is picked on 127.0.0.1.
async function freeLocalPort(): Promise<number> {
    const probe = createServer().listen(0, "127.0.0.1");
    await once(probe, "listening");
    const { port } = probe.address() as AddressInfo;
    await new Promise((resolve) => probe.close(resolve));
    return port;
}

// Gives the calling test file its own empty database for every test.
export function useTestDatabase(): void {
    let server: MongoMemoryServer;

    beforeAll(async () => {
        server = await MongoMemoryServer.create({ instance: { port: await freeLocalPort() } });
        await mongoose.connect(server.getUri());
        // Unique and TTL indexes must exist before the first test relies on them.
        await Promise.all([UserModel.init(), SessionModel.init(), ReportModel.init()]);
    });

    beforeEach(async () => {
        await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({}), ReportModel.deleteMany({})]);
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await server.stop();
    });
}