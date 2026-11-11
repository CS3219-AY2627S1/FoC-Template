DROP TABLE "job_run" CASCADE;--> statement-breakpoint
ALTER TABLE "user_metrics" DROP COLUMN "reconciled_at";--> statement-breakpoint
DROP TYPE "public"."run_status";--> statement-breakpoint
DROP TYPE "public"."run_trigger";