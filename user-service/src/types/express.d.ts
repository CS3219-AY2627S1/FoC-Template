// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4a - Express Request augmentation
// Author review:
// 2026-11-09: Stage 27a - req.user gains `sid` (the access token's refresh_tokens.id claim),
//   per instructions.md Stage 27. No requirements, architecture, schema, or API decisions were
//   made by the AI tool.
// Author review:

declare global {
  namespace Express {
    interface Request {
      user?: { user_id: string; role: string; sid: string };
    }
  }
}

export {};
