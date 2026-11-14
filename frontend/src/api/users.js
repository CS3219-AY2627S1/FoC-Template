/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Created the admin user-management calls used by AdminUsers.jsx, per instructions.md
 *        Stage 16g: listUsers (GET /users, paginated/searchable/filterable/sortable per the
 *        user-service's Stage 15b), updateUserStatus (PUT /users/:id/status) and
 *        updateUserRole (PUT /users/:id/role).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: listUsers takes the `locked` filter, and added unlockUser (POST /users/:id/unlock),
 *        per instructions.md Stage 18e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added getFullEmail (GET /users/:id/full-email), per instructions.md Stage 20b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Added getUser (GET /users/:id), per instructions.md Stage 24, for the new admin
 *        user-history page's profile section.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26e - updateUserStatus, updateUserRole and unlockUser now take a `reason`
 *        ({ reason } or { reason: 'OTHER', otherReason }), required by the backend's Stage
 *        26b. getFullEmail is now a POST taking the same `reason` shape, replacing the GET
 *        call removed in Stage 26c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat (instructions.md Stage 26 "Reasons" amendment): unlockUser
 *        and getFullEmail no longer take or send a `reason`; their request bodies are now empty.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - updateUserStatus and updateUserRole now attach
 *        Elevated-Token (utils/elevation.js's elevatedTokenHeader) and clear the stored token
 *        on a 403 ELEVATION_REQUIRED response, per the stage's "a token rejected with
 *        ELEVATION_REQUIRED is also removed" rule. Centralised here rather than in each caller
 *        (AdminUsers.jsx, AdminUserTransactions.jsx) since both call these same two functions.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'
import { clearElevationToken, elevatedTokenHeader } from '../utils/elevation'

// 200 { users, page, pageSize, total, totalPages }. users.js's shape mirrors profile.js's
// getProfile, plus isLocked/lockedUntil/lockLevel (Stage 18d): { id, username, email, status,
// role, activeView, createdAt, updatedAt, isLocked, lockedUntil, lockLevel }.
// Admin/super admin only (403 FORBIDDEN otherwise).
export async function listUsers({ page, username, email, status, role, locked, sortBy, sortDir }) {
  return request('/users', {
    query: { page, username, email, status, role, locked, sortBy, sortDir },
  })
}

// 200 the full user shape. 404 USER_NOT_FOUND, 403 SUPER_ADMIN_IMMUTABLE / FORBIDDEN (an admin
// targeting another admin) / ELEVATION_REQUIRED (Stage 27b; clears any stored elevation token),
// 422 CANNOT_CHANGE_STATUS_PENDING_USER, 400 VALIDATION_ERROR (bad reason). `reason` is
// { reason: '<CODE>' } or { reason: 'OTHER', otherReason: '<text>' }.
export async function updateUserStatus(id, status, reason) {
  try {
    return await request('/users/' + id + '/status', {
      method: 'PUT',
      headers: elevatedTokenHeader(),
      json: { status, ...reason },
    })
  } catch (err) {
    if (err.code === 'ELEVATION_REQUIRED') clearElevationToken()
    throw err
  }
}

// 200 the full user shape. super admin only (403 FORBIDDEN otherwise). 404 USER_NOT_FOUND, 403
// SUPER_ADMIN_IMMUTABLE / SELF_ROLE_CHANGE / ELEVATION_REQUIRED (Stage 27b; clears any stored
// elevation token), 422 CANNOT_CHANGE_ROLE_PENDING_USER / CANNOT_CHANGE_ROLE_SUSPENDED_USER, 400
// VALIDATION_ERROR (bad reason).
export async function updateUserRole(id, role, reason) {
  try {
    return await request('/users/' + id + '/role', {
      method: 'PUT',
      headers: elevatedTokenHeader(),
      json: { role, ...reason },
    })
  } catch (err) {
    if (err.code === 'ELEVATION_REQUIRED') clearElevationToken()
    throw err
  }
}

// 200 the full user shape. Admin/super admin (403 FORBIDDEN otherwise). 404 USER_NOT_FOUND,
// 403 SUPER_ADMIN_IMMUTABLE / FORBIDDEN (an admin targeting another admin). A target that is
// not login-locked is a no-op (200, unchanged). No reason required.
export async function unlockUser(id) {
  return request('/users/' + id + '/unlock', { method: 'POST', json: {} })
}

// 200 { email } (the real, unmasked email). Admin/super admin only (403 FORBIDDEN otherwise).
// 404 USER_NOT_FOUND, 403 FORBIDDEN (target is a super admin). Stage 26c: POST (was GET, no
// body); no reason required.
export async function getFullEmail(id) {
  return request('/users/' + id + '/full-email', { method: 'POST', json: {} })
}

// 200 { id, username, email, status, role, activeView, createdAt, updatedAt }, any status.
// Admin/super admin only (403 FORBIDDEN otherwise). 404 USER_NOT_FOUND.
export async function getUser(id) {
  return request('/users/' + id)
}
