import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import "./config/env.ts";
import { sequelize } from "./models/index.ts";
import * as outboxRelay from "./events/outboxRelay.ts";
import * as expiryWorker from "./events/expiryWorker.ts";
import router from "./routes/orderRoutes.ts";
import errorHandling, { notFoundHandler } from "./middleware/errorHandler.ts";

const app: Express = express();

const PORT = process.env.PORT || 3003;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/orders/", router);


app.use(notFoundHandler);
app.use(errorHandling);


async function start(): Promise<void> {
  let server: ReturnType<Express["listen"]>;
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log("Database connected and synced.");

    outboxRelay.start();
    expiryWorker.start();

    server = app.listen(PORT, () => {
      console.log(`Server running on PORT ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start: " + (err as Error).message);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down...`);
    server.close(); // stop accepting new connections
    await expiryWorker.stop();
    await outboxRelay.stop();
    await sequelize.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void start();