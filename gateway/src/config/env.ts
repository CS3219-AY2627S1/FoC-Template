// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-10-20
// Scope: Remove the Gateway JWT secret requirement after moving authentication into services.
// Author review: Review pending.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-30
// Scope: Added the shared Gateway environment configuration for the
// finalized Phase 2 JWT authentication setup.
// Author review: Reviewed and validated against the project environment
// contract and required defaults.

import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 8080),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  userServiceUrl: process.env.USER_SERVICE_URL ?? "http://localhost:3002",
  supplierServiceUrl: process.env.SUPPLIER_SERVICE_URL ?? "http://localhost:3001",
  creditServiceUrl: process.env.CREDIT_SERVICE_URL ?? "http://localhost:3004",
  orderServiceUrl: process.env.ORDER_SERVICE_URL ?? "http://localhost:3003",
};
