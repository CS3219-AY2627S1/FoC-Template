-- CreateEnum
CREATE TYPE "AdminRoleAction" AS ENUM ('GRANT', 'REVOKE');

-- CreateTable
CREATE TABLE "SystemBootstrap" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "initializedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminUserId" TEXT NOT NULL,

    CONSTRAINT "SystemBootstrap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRoleChange" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT NOT NULL,
    "action" "AdminRoleAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRoleChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminRoleChange_targetId_idx" ON "AdminRoleChange"("targetId");
