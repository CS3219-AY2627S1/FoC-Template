// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-10-20
// Scope: Keep only the request ID type augmentation after removing Gateway user context.
// Author review: Review pending.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-30
// Scope: Keep the Gateway request ID augmentation for request logging and forwarding.
// Author review: Reviewed against the request ID middleware contract.

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export {};