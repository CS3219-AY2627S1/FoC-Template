// AI assistance: OpenAI Codex, 2026-11-09. Scope: database fixture shutdown regression. Review: Reviewed and approved by @ron on 2026-11-09.
import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer, connect, type Socket } from "node:net";
import { createTestDatabase } from "./helpers";

it("database teardown closes concurrent clients without forced-termination errors", { timeout: 30_000 }, async () => {
  const original = process.env.TEST_DATABASE_URL!;
  const destination = new URL(original);
  const sockets = new Set<Socket>();
  // Delay only PostgreSQL's Terminate packet, making the observed cleanup race
  // deterministic without changing the driver, business code, or assertions.
  const proxy = createServer({ allowHalfOpen: true }, incoming => {
    const backend = connect({ host: destination.hostname, port: Number(destination.port || 5432), allowHalfOpen: true });
    sockets.add(incoming); sockets.add(backend);
    let terminating = false;
    incoming.on("data", chunk => {
      if (chunk.length === 5 && chunk[0] === 0x58) {
        terminating = true;
        setTimeout(() => { if (!backend.destroyed) backend.end(chunk); }, 500).unref();
      } else backend.write(chunk);
    });
    incoming.on("end", () => { if (!terminating) backend.end(); });
    backend.on("data", chunk => incoming.write(chunk));
    backend.on("end", () => incoming.end());
    incoming.on("error", () => backend.destroy());
    backend.on("error", () => incoming.destroy());
    incoming.on("close", () => sockets.delete(incoming));
    backend.on("close", () => sockets.delete(backend));
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  assert.ok(address && typeof address !== "string");
  const url = new URL(original);
  url.hostname = "127.0.0.1"; url.port = String(address.port);
  process.env.TEST_DATABASE_URL = url.toString();
  try {
    const db = await createTestDatabase();
    const errors: Error[] = [];
    db.pool.on("error", error => errors.push(error));
    const clients = await Promise.all(Array.from({ length: 20 }, () => db.pool.connect()));
    const closed = clients.map(client => new Promise<void>(resolve => {
      client.on("error", error => errors.push(error));
      client.once("end", resolve);
    }));
    for (const client of clients) client.release();
    await db.drop();
    await Promise.all(closed);
    assert.deepEqual(errors.map(error => error.message), []);
  } finally {
    process.env.TEST_DATABASE_URL = original;
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
