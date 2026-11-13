/*
  Warnings:

  - A unique constraint covering the columns `[previousTokenHash]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "previousTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_previousTokenHash_key" ON "RefreshToken"("previousTokenHash");
