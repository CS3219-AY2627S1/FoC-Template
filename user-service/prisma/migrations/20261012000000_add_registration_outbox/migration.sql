-- Storage only: existing users do not receive registration events or grants.
CREATE TABLE "OutboxEvent" (
    "eventId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "OutboxEvent_publishedAt_nextAttemptAt_createdAt_idx"
    ON "OutboxEvent"("publishedAt", "nextAttemptAt", "createdAt");
