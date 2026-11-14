/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-07
 * Scope: Implemented the team-specified chat creation endpoint and supporting scaffold.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
 * Scope: Verified TLS to MySQL when DB_SSL is on, matching supplier-service's DB_SSL, per George's
 *        ECS Fargate plan (docs/ecs-fargate-session-prompt.md, "DB encryption") and his chat
 *        instruction. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
export type { PrismaClient };
export function createPrismaClient(
  databaseUrl: string,
  options: { ssl?: boolean } = {},
): PrismaClient {
  const url = new URL(databaseUrl);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      timezone: "+00:00",
      // AI-generated (edited by <name>).
      // Checks the certificate chain (the RDS CA comes from NODE_EXTRA_CA_CERTS) and that the
      // certificate names this host, like supplier-service's verifyIdentity.
      ...(options.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    }),
  });
}
