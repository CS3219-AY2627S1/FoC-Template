/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated the role-guard middleware implementing the per-endpoint role column from
 *        SupplierServiceArchitecture.md §7 (user, admin, super admin). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): skip the role check when
 *        authenticate.ts already authenticated the request via the Supplier-Order-Service-Key
 *        (instructions.md Stage 28 c1: "no user token and no role check" on the two routes that
 *        accept it; authenticate.ts never sets this flag on any other route). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

export function requireRole(...allowedRoles: string[]) {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    if (req.supplierServiceKeyAuthenticated === true) {
      next();
      return;
    }
    if (req.user === undefined || !allowedRoles.includes(req.user.role)) {
      next(new AppError(403, 'Forbidden', 'You do not have permission to perform this operation.'));
      return;
    }
    next();
  };
}
