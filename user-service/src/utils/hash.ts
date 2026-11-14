// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4a - hashing utility
// Author review:
// 25/09/2026: Stage 5a - constant-time hash comparison
// Author review:

import { createHash, timingSafeEqual } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (a.length !== b.length || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
