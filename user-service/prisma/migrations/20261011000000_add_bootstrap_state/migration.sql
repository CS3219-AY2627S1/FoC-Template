BEGIN;

CREATE TABLE "BootstrapState" (
    "key" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BootstrapState_pkey" PRIMARY KEY ("key")
);

-- Existing installations have already provisioned their first administrator.
INSERT INTO "BootstrapState" ("key")
SELECT 'first-admin'
WHERE EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMIN');

COMMIT;
