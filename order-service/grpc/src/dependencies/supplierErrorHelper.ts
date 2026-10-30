// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-24 Asia/Singapore.
// Scope: Ported approved Supplier ID adapter from d3-demo; human review pending.
// Prompt/checks: ../../../usage-log.md.
import { parseSupplierId } from '@foc/grpc';
import { InvalidSupplierError } from '../grpc/error';

export function toSupplierRpcId(supplierId: string): number {
  const id = parseSupplierId(supplierId);
  if (id === undefined) {
    throw new InvalidSupplierError('supplierId must be a positive safe integer');
  }
  return id;
}
