CREATE TABLE "deleted_user" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rating" ALTER COLUMN "rater_id" DROP NOT NULL;