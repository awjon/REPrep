ALTER TABLE "deals" ADD COLUMN "form17_received_on" date;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closing_date" date;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "possession_days_after_closing" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "period_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_dates_one_per_kind" ON "deal_dates" USING btree ("deal_id","kind") WHERE kind <> 'custom';