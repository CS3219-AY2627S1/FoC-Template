-- AlterTable
ALTER TABLE "user_outbox" ADD COLUMN     "delete_on_publish" BOOLEAN NOT NULL DEFAULT false;
