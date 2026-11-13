import { vi } from "vitest";

// index.ts starts the server, the database connection and the consumer. message.service.ts only
// needs its socketServer, so tests get a stand-in that records what would be pushed.
vi.mock("../src/index.ts", () => ({ socketServer: { sendToUser: vi.fn() } }));
