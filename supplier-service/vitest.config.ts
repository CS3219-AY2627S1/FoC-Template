/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated Vitest config that supplies the environment variables src/config.ts requires,
 *        using the values from .env.example, so tests can import config. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29 update): Excluded *.minio.test.ts from the default suite (Phase 2 plan, Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): only run tests under the new test/
 *        folder. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
  * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): excluded *.seed.test.ts from the default run so
 *        the seed (npm run seed) is not part of npm test. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
  * Scope (2026-11-04, Claude Code, model: claude-sonnet-5-5): excluded *.apidemo.test.ts (live-stack suite) from the default run.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): added SUPPLIER_ORDER_SERVICE_API_KEY,
 *        per instructions.md Stage 28 c1. No requirements, architecture, schema, or API decisions
 *        were made by the AI tool.
 * Author review:
 */
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.minio.test.ts', '**/*.seed.test.ts', '**/*.apidemo.test.ts'],
    env: {
      PORT: '3002',
      NODE_ENV: 'test',
      DB_HOST: 'supplier-db',
      DB_PORT: '3306',
      DB_NAME: 'supplier_service',
      DB_USER: 'root',
      DB_PASSWORD: 'supplier_root_password',
      REDIS_HOST: 'supplier-redis',
      REDIS_PORT: '6379',
      USER_SERVICE_URL: 'http://user-service:3001',
      SUPPLIER_ORDER_SERVICE_API_KEY: 'test-supplier-order-service-key',
    },
  },
});
