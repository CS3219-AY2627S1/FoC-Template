-- CreateTable
CREATE TABLE "user_outbox" (
    "event_id" UUID NOT NULL,
    "queue" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "user_outbox_pkey" PRIMARY KEY ("event_id")
);

-- Dispatcher only reads unpublished rows, oldest first.
CREATE INDEX "user_outbox_unpublished_idx" ON "user_outbox" ("created_at") WHERE "published_at" IS NULL;
