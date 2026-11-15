/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added bounded Supplier runtime environment parsing.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; added User
 * Service verification endpoint and timeout parsing for issue #16.
 * Author review of additional changes: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; exposed the
 * repository/container Supplier image directory convention for issue #17.
 * Author review of issue #17 changes: Reviewed and approved by @ron.
 */
import { resolve } from "node:path";

export interface SessionVerificationConfiguration {
  userServiceBaseUrl: string;
  timeoutMs: number;
}

const MAX_ABORT_SIGNAL_TIMEOUT_MS = 2_147_483_647;

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

export function getRuntimeDatabaseRole(): string | undefined {
  const role = process.env.DATABASE_RUNTIME_ROLE?.trim();
  if (!role) {
    return undefined;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(role)) {
    throw new Error(
      "DATABASE_RUNTIME_ROLE must be a PostgreSQL identifier of at most 63 characters.",
    );
  }

  return role;
}

export function getPort(): number {
  const configuredPort = process.env.PORT ?? "3000";
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const port = Number(configuredPort);
  if (port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

export function getSupplierImageDirectory(): string {
  return resolve(process.cwd(), "../data/images");
}

export function getSessionVerificationConfiguration(): SessionVerificationConfiguration {
  const configuredBaseUrl = process.env.USER_SERVICE_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    throw new Error("USER_SERVICE_BASE_URL is required.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("USER_SERVICE_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    throw new Error(
      "USER_SERVICE_BASE_URL must be an HTTP(S) URL without credentials, a query, or a fragment.",
    );
  }

  const configuredTimeout = process.env.USER_SERVICE_VERIFY_TIMEOUT_MS?.trim();
  if (!configuredTimeout || !/^\d+$/.test(configuredTimeout)) {
    throw new Error(
      "USER_SERVICE_VERIFY_TIMEOUT_MS must be a positive integer in milliseconds.",
    );
  }

  const timeoutMs = Number(configuredTimeout);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_ABORT_SIGNAL_TIMEOUT_MS
  ) {
    throw new Error(
      `USER_SERVICE_VERIFY_TIMEOUT_MS must be between 1 and ${MAX_ABORT_SIGNAL_TIMEOUT_MS}.`,
    );
  }

  return {
    userServiceBaseUrl: baseUrl.toString(),
    timeoutMs,
  };
}
