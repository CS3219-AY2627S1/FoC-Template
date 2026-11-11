CREATE TYPE "public"."fault_party" AS ENUM('requester', 'courier', 'no-fault');--> statement-breakpoint
ALTER TABLE "disputed_order" ADD COLUMN "requester_id" uuid;--> statement-breakpoint
ALTER TABLE "disputed_order" ADD COLUMN "courier_id" uuid;--> statement-breakpoint
ALTER TABLE "disputed_order" ADD COLUMN "fault_party" "fault_party";--> statement-breakpoint
ALTER TABLE "disputed_order" ADD COLUMN "resolved_at" timestamp with time zone;