// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 5a - OTP generation
// Author review:

import { randomInt } from "node:crypto";

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
