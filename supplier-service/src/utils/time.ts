/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated Phase0 Task5 SGT timestamp utility.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29 update): Added the sgtDatetime helper (Phase 2 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 *        Tool: Claude Code (model: claude-sonnet-5).
 * Author review:
 */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function sgtTimestamp(date = new Date()): string {
  const shiftedDate = new Date(date.getTime() + SGT_OFFSET_MS);
  return `${shiftedDate.toISOString().slice(0, 19)}+08:00`;
}

/** Singapore wall-clock time in MySQL DATETIME form, e.g. '2026-09-29 10:00:00' (Arch §6.2). */
export function sgtDatetime(date = new Date()): string {
  const shiftedDate = new Date(date.getTime() + SGT_OFFSET_MS);
  return shiftedDate.toISOString().slice(0, 19).replace('T', ' ');
}
