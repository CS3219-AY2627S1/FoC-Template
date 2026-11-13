import "dotenv/config";
import http from "node:http";
import { env } from "./config.ts";
import * as consumer from "./events/consumer.ts";
import { snsEnabled } from "./notifications/sender.ts";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const ok = consumer.isConnected();
    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: ok ? "ok" : "connecting", sns: snsEnabled() }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(env.PORT, () => {
  console.log(
    `Notification service on port ${env.PORT} (SNS ${snsEnabled() ? "enabled" : "disabled: logging emails only"})`,
  );
  void consumer.start();
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} received, shutting down`);
  await consumer.stop();
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
