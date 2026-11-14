// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - server entry point split out of app.ts (bootstrap, then listen)
// Author review:
// 2026-10-02: also run bootstrapTestUser at startup
// Author review: Congchen
// 2026-10-21: Stage 14c - start the credit outbox relay after the bootstrap. No requirements,
//   architecture, schema, or API decisions were made by the AI tool — see instructions.md
//   Stage 14 for the governing decision.
// Author review:
// 2026-11-06: Tool: Claude Code (model: claude-opus-5-5). ECS Fargate migration - longer HTTP
//   keep-alive, per George's ECS Fargate plan, Phase 1 item 8. No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review: George Yeo
import { config } from './config.js';
import app from './app.js';
import { bootstrapSuperAdmin, bootstrapTestUser } from './services/bootstrap.service.js';
import { startCreditOutboxRelay } from './services/creditOutbox.relay.js';

await bootstrapSuperAdmin();
await bootstrapTestUser();

startCreditOutboxRelay();

const server = app.listen(config.server.port, () => {
  console.log(`user-service listening on port ${config.server.port}`);
});
// Outlast the ALB's 60s idle timeout, so the ALB never reuses a socket Node just closed (a 502).
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
