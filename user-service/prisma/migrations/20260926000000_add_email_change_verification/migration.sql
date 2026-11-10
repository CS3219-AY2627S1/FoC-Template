-- CreateTable
CREATE TABLE "PendingEmailChange" (
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "otpHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailSentAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingEmailChange_pkey" PRIMARY KEY ("challengeId"),
    CONSTRAINT "PendingEmailChange_newEmail_canonical" CHECK ("newEmail" = lower("newEmail" COLLATE "C") AND "newEmail" COLLATE "C" ~ '^[!-~]+$')
);

-- CreateTable
CREATE TABLE "EmailChangeOtpRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeOtpRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailChangeOtpRequest_email_canonical" CHECK ("email" = lower("email" COLLATE "C") AND "email" COLLATE "C" ~ '^[!-~]+$')
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingEmailChange_userId_key" ON "PendingEmailChange"("userId");

-- CreateIndex
CREATE INDEX "PendingEmailChange_newEmail_idx" ON "PendingEmailChange"("newEmail");

-- CreateIndex
CREATE INDEX "PendingEmailChange_expiresAt_idx" ON "PendingEmailChange"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailChangeOtpRequest_userId_requestedAt_idx" ON "EmailChangeOtpRequest"("userId", "requestedAt");

-- CreateIndex
CREATE INDEX "EmailChangeOtpRequest_email_requestedAt_idx" ON "EmailChangeOtpRequest"("email", "requestedAt");

-- CreateIndex
CREATE INDEX "EmailChangeOtpRequest_requestedAt_idx" ON "EmailChangeOtpRequest"("requestedAt");

-- AddForeignKey
ALTER TABLE "PendingEmailChange" ADD CONSTRAINT "PendingEmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeOtpRequest" ADD CONSTRAINT "EmailChangeOtpRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
