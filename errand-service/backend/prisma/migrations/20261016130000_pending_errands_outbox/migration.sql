CREATE TABLE "pending_errands" (
  "id" UUID NOT NULL,
  "requesterSub" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pending_errands_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pending_errands_createdAt_idx" ON "pending_errands"("createdAt");
CREATE TABLE "errand_event_outbox" (
  "id" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "errand_event_outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "errand_event_outbox_publishedAt_createdAt_idx" ON "errand_event_outbox"("publishedAt", "createdAt");
