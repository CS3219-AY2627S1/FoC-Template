import "dotenv/config";
import type { StringValue } from "ms";

export const env = {
  port: Number(process.env.PORT) || 3002,
  nodeEnv: process.env.NODE_ENV || "development",
  creditServiceUrl:
    process.env.CREDIT_SERVICE_URL || "http://localhost:3004",

  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5433,
    database: process.env.DB_DATABASE || "user_service_db",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
  },

  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;

      if (!secret || !secret.trim()) {
        throw new Error("JWT_SECRET is not configured.");
      }

      return secret;
    })(),
    expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as StringValue,
    refreshExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 30,
  },
};
