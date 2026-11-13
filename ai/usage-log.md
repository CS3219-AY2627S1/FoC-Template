# AI-assisted files

See errand-service-frontend.md, supplier-service-frontend.md, user-service-frontend.md
- `packages/ui/src`

See errand-service-frontend.md
- `errand-service/frontend/src`
- `errand-service/frontend/src/components`
- `errand-service/frontend/src/hooks`

See supplier-service-frontend.md
- `supplier-service/frontend/src`
- `supplier-service/frontend/src/components`
- `supplier-service/frontend/src/mockSupplierApi`

See user-service-frontend.md
- `user-service/frontend/src/app`
- `user-service/frontend/src/components`
- `user-service/frontend/src/components/account`
- `user-service/frontend/src/components/base-elements`
- `user-service/frontend/src/user`

See aws-implementation.md and kubernetes-cloudformation.md
- `infra/`
- `k8s/base`
- `k8s/floci`

See credit-backend-implementation.md
- `credit-service/backend/src`
- `credit-service/tests/`
- `credit-service/backend/tests`

See errand-service-backend.md
- `errand-service/backend/src`
- `errand-service/backend/tests`

See user-service-backend.md
- `user-service/backend/src`
- `user-service/backend/tests`
- `user-service/backend/prisma`

See load-tests.md
- `load-tests`

See docs.md
- `docs`
See supplier-backend-implementation.md

- `supplier-service/backend/Dockerfile`
- `supplier-service/backend/migrate.js`
- `supplier-service/backend/src/app.ts`
- `supplier-service/backend/src/db.ts`
- `supplier-service/backend/src/middleware/internal-auth.middleware.ts`
- `supplier-service/backend/src/repositories/supplier.repository.ts`
- `supplier-service/backend/src/routes/internal-supplier.routes.ts`
- `supplier-service/backend/src/routes/supplier.routes.ts`
- `supplier-service/backend/src/services/supplier-availability.ts`
- `supplier-service/backend/src/services/supplier.service.ts`
- `supplier-service/backend/src/validators/supplier.validator.ts`

See supplier-backend-tests.md

- `supplier-service/backend/test/admin-access.test.ts`
- `supplier-service/backend/tests/supplier-filter.test.ts`
- `supplier-service/backend/tests/supplier.service.test.ts`

See errand-backend-implementation.md

- `errand-service/backend/Dockerfile`
- `errand-service/backend/src/app.ts`
- `errand-service/backend/src/clients/credit-estimation.client.ts`
- `errand-service/backend/src/clients/supplier.client.ts`
- `errand-service/backend/src/constants/errand-error-map.ts`
- `errand-service/backend/src/consumers/consumer.ts`
- `errand-service/backend/src/controllers/errand.controller.ts`
- `errand-service/backend/src/repositories/errand.repository.ts`
- `errand-service/backend/src/routes/internal-errand.routes.ts`
- `errand-service/backend/src/services/errandEventStream.ts`
- `errand-service/backend/src/utils/translate-error.ts`
- `errand-service/backend/src/validators/errand.validator.ts`
- `errand-service/backend/src/workers/pending-errand.worker.ts`

See errand-frontend-implementation.md

- `errand-service/frontend/src/components/CreateErrandCard.tsx`
- `errand-service/frontend/src/hooks/useErrandNotifications.ts`

See errand-backend-tests.md

- `errand-service/backend/tests/accept-outbox-integration.test.ts`
- `errand-service/backend/tests/errand-accept-concurrency.test.ts`
- `errand-service/backend/tests/errand-accept-expiry-edge-cases.test.ts`
- `errand-service/backend/tests/errand-creation.test.ts`
- `errand-service/backend/tests/errand-delete-errors.test.ts`
- `errand-service/backend/tests/errand-soft-delete.test.ts`
- `errand-service/backend/tests/errand.service.test.ts`
- `errand-service/backend/tests/outbox.integration.test.ts`
- `errand-service/backend/tests/setup.ts`
- `errand-service/backend/vitest.config.ts`

See errand-notification-backend-implementation.md

- `errand-notification-service/backend/Dockerfile`
- `errand-notification-service/backend/src/app.ts`
- `errand-notification-service/backend/src/config/env.ts`
- `errand-notification-service/backend/src/consumers/consumer.ts`
- `errand-notification-service/backend/src/server.ts`
- `errand-notification-service/backend/src/services/notificationEventStream.ts`

See errand-notification-backend-tests.md

- `errand-notification-service/backend/tests/notification-event-stream.test.ts`
- `errand-notification-service/backend/tests/process-errand-event.test.ts`

See credit-estimation-backend-implementation.md

- `credit-estimation-service/backend/Dockerfile`
- `credit-estimation-service/backend/src/app.ts`
- `credit-estimation-service/backend/src/clients/ai.client.ts`
- `credit-estimation-service/backend/src/clients/perServiceRateLimiter.ts`
- `credit-estimation-service/backend/src/clients/rateLimiter.factory.ts`
- `credit-estimation-service/backend/src/clients/rateLimiter.ts`
- `credit-estimation-service/backend/src/clients/redisRateLimiter.ts`
- `credit-estimation-service/backend/src/config/baselines.ts`
- `credit-estimation-service/backend/src/config/env.ts`
- `credit-estimation-service/backend/src/config/reason.ts`
- `credit-estimation-service/backend/src/controllers/estimation.controller.ts`
- `credit-estimation-service/backend/src/middleware/internal.middleware.ts`
- `credit-estimation-service/backend/src/routes/estimation.routes.ts`
- `credit-estimation-service/backend/src/services/estimation.service.ts`
- `credit-estimation-service/backend/src/services/time-adjustment.service.ts`
- `credit-estimation-service/backend/src/validators/baseline.validator.ts`
- `credit-estimation-service/backend/src/validators/estimation.validator.ts`

See credit-estimation-backend-tests.md

- `credit-estimation-service/backend/tests/baseline.validator.test.ts`
- `credit-estimation-service/backend/tests/env.test.ts`
- `credit-estimation-service/backend/tests/estimation.service.test.ts`
- `credit-estimation-service/backend/tests/estimation.validator.test.ts`
- `credit-estimation-service/backend/tests/rateLimiter.test.ts`
- `credit-estimation-service/backend/tests/reason.test.ts`
- `credit-estimation-service/backend/tests/redisRateLimiter.test.ts`
- `credit-estimation-service/backend/tests/setup.ts`
- `credit-estimation-service/backend/tests/time-adjustment.service.test.ts`
- `credit-estimation-service/backend/vitest.config.ts`
