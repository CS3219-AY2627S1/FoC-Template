-- CreateTable
CREATE TABLE "ArchivedUser" (
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchivedUser_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "ArchivedUser_purgeAfter_idx" ON "ArchivedUser"("purgeAfter");
