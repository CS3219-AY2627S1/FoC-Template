ALTER TYPE "public"."credit_operation" ADD VALUE 'REVOCATION';--> statement-breakpoint
ALTER TABLE "credit_user" ADD COLUMN "deleted_at" timestamp with time zone;