ALTER TABLE "review_findings" ADD COLUMN "quote_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "review_runs" ADD COLUMN "pages_reviewed" integer DEFAULT 0 NOT NULL;