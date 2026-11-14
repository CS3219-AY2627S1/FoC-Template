/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated the Express app wiring: rate limiter, auth middleware and error handler under
 *        /api/v1 (SupplierServiceArchitecture.md §7 intro). No CORS, since a single API gateway
 *        fronts all FoC services (§3); no health-check route (§7.5 deferred); no supplier-domain
 *        routes this phase. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): mounted the Phase 1 /suppliers router on
 *        apiV1. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): mounted the admin supplier router at
 *        /admin/suppliers per Phase 2 plan Task 3. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): mounted the lookup router at /admin/reference per
 *        Phase 2 plan Task 4. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): wired the supplier creation service, S3
 *        photo storage, Redis idempotency store and write repository into the admin supplier router
 *        per Phase 2 plan Task 8. No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): created the write repository and photo storage once and wired the update service per Phase 3 plan Task 7. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): wired the supplier deletion service into the admin supplier router per Phase 4 plan Task 6. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): dropped the job-queue wiring from the update service (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): construct the update service before the creation service and pass it in as the creation service's update dependency (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - static GET /health ahead of
 *        the rate limiter and longer HTTP keep-alive, per George's ECS Fargate plan, Phase 1 items 7 and 8.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import express from 'express';
import { createLookupService } from './business/lookupService.js';
import { createSupplierCreationService } from './business/supplierCreationService.js';
import { createSupplierDeletionService } from './business/supplierDeletionService.js';
import { createSupplierService } from './business/supplierService.js';
import { createSupplierUpdateService } from './business/supplierUpdateService.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createRedisIdempotencyStore } from './idempotency/idempotencyStore.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createMysqlLookupRepository } from './persistence/mysqlLookupRepository.js';
import { createMysqlSupplierRepository } from './persistence/mysqlSupplierRepository.js';
import { createMysqlSupplierWriteRepository } from './persistence/mysqlSupplierWriteRepository.js';
import redis from './redis/client.js';
import { createAdminSupplierRouter } from './routes/adminSupplier.routes.js';
import { createLookupRouter } from './routes/lookup.routes.js';
import { createSupplierRouter } from './routes/supplier.routes.js';
import { createConfiguredPhotoStorage } from './storage/s3PhotoStorage.js';

const app = express();

app.set('trust proxy', true);
app.use(express.json());
// Ahead of the per-IP limiter, so load balancer health checks can never be rate limited.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.use(createRateLimiter());

const apiV1 = express.Router();
apiV1.use(authenticate);
const supplierService = createSupplierService(createMysqlSupplierRepository(pool));
apiV1.use('/suppliers', createSupplierRouter(supplierService));
const writeRepository = createMysqlSupplierWriteRepository(pool);
const photoStorage = createConfiguredPhotoStorage(config.photoStore);
const supplierUpdate = createSupplierUpdateService({
  repo: writeRepository,
  storage: photoStorage,
  reader: supplierService,
});
const supplierCreation = createSupplierCreationService({
  repo: writeRepository,
  storage: photoStorage,
  reader: supplierService,
  update: supplierUpdate,
});
apiV1.use(
  '/admin/suppliers',
  createAdminSupplierRouter({
    reader: supplierService,
    creation: supplierCreation,
    update: supplierUpdate,
    deletion: createSupplierDeletionService({ repo: writeRepository }),
    idempotency: createRedisIdempotencyStore(redis),
  }),
);
apiV1.use('/admin/reference', createLookupRouter(createLookupService(createMysqlLookupRepository(pool))));
app.use('/api/v1', apiV1);

app.use(errorHandler);

if (config.env !== 'test') {
  const server = app.listen(config.server.port, () => {
    console.log(`supplier-service listening on port ${config.server.port}`);
  });
  // Outlast the ALB's 60s idle timeout, so the ALB never reuses a socket Node just closed (a 502).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

export default app;
