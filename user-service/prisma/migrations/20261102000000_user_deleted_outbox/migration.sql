-- Intentionally independent of User: deletion and its durable notification
-- commit together, and the notification survives the account's removal.
CREATE TABLE "UserDeletedOutbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "UserDeletedOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserDeletedOutbox_userId_key" ON "UserDeletedOutbox"("userId");
CREATE INDEX "UserDeletedOutbox_publishedAt_createdAt_idx" ON "UserDeletedOutbox"("publishedAt", "createdAt");
