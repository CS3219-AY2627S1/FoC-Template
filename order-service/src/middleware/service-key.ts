/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: Service-key check for supplier-service's worker (header order-supplier-service-key,
 *        constant-time compare), per the team decision in chat, 2026-11-11. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export const SUPPLIER_SERVICE_KEY_HEADER = 'order-supplier-service-key';

function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 503 when no key is configured (never open by default); 401 on a missing or wrong key. */
export function requireSupplierServiceKey(
  expected: string | undefined,
): RequestHandler {
  return (req, res, next) => {
    if (!expected) {
      res.status(503).json({ message: 'Service key is not configured.' });
      return;
    }
    const supplied = req.get(SUPPLIER_SERVICE_KEY_HEADER);
    if (!supplied || !sameKey(supplied, expected)) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }
    next();
  };
}
