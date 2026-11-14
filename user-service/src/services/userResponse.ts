/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created toUserResponse, the shared camelCase mapper for user rows, per
 *        instructions.md Stage 15c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added isLocked, lockedUntil and lockLevel, per instructions.md Stage 18d.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: toUserResponse now takes the requester's ID and masks email unless the row is the
 *        requester's own, per instructions.md Stage 20 (NFR3.1.1).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Added the team-specified preferred_lang setting (ISO 639-1 subset: en, zh, hi, ta, ms, es, ar; default en), following the active-view flow.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F3 - isLocked now reads the DB-computed row.is_locked (clock_timestamp(),
 *        convention 5) instead of comparing against Date.now(); the mapper takes
 *        UserRowWithLock so a query that omits is_locked fails to compile.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge disclosure conflict.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F4 - the mapper's input type is now SafeUserRow (no password_hash); the body is
 *        unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import type { SafeUserRow } from '../db/queries/users.queries.js';
import { maskEmail } from '../utils/maskEmail.js';

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  status: 'pending' | 'active' | 'suspended';
  role: 'user' | 'admin' | 'super admin';
  activeView: 'requester' | 'courier';
  preferredLang: string;
  createdAt: Date;
  updatedAt: Date;
  isLocked: boolean;
  lockedUntil: Date | null;
  lockLevel: number;
}

// password_hash must never leave the service layer, and DB columns stay snake_case -
// this is the one place that maps a user row to the camelCase shape every response uses.
// requesterId masks email (Stage 20) unless the row is the requester's own.
// isLocked is decided in SQL (IS_LOCKED_SQL, fix F3): the row type requires is_locked, so a
// query that forgets to select it is a compile error rather than a silently false field.
// The input type has no password_hash (SafeUserRow, fix F4); a FOR UPDATE row that does carry it
// still type-checks structurally, but only the fields listed below are ever copied out.
export function toUserResponse(row: SafeUserRow, requesterId: string): UserResponse {
  return {
    id: row.id,
    username: row.username,
    email: row.id === requesterId ? row.email : maskEmail(row.email),
    status: row.status,
    role: row.role,
    activeView: row.active_view,
    preferredLang: row.preferred_lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isLocked: row.is_locked,
    lockedUntil: row.login_locked_until,
    lockLevel: row.login_lock_level,
  };
}
