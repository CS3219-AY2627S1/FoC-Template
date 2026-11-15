/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Copied from credit-service/src/log.ts (branch_credit): one-line JSON logs.
 * Author review: Reviewed and approved by @mattis.
 */

type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields: Fields): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "info") console.log(line);
  else console.error(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => write("info", event, fields),
  warn: (event: string, fields: Fields = {}) => write("warn", event, fields),
  error: (event: string, fields: Fields = {}) => write("error", event, fields),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
