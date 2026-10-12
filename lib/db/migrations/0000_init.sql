CREATE TYPE "public"."deadline_kind" AS ENUM('earnest_money', 'form17_review', 'inspection', 'title_review', 'financing', 'appraisal', 'closing', 'possession', 'custom');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('watching', 'offer_prep', 'under_contract', 'closed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('unknown', 'form17', 'inspection', 'title', 'hoa', 'other');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "comp_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"params" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comp_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deal_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" "deadline_kind" NOT NULL,
	"label" text NOT NULL,
	"period_days" integer,
	"due_at" timestamp with time zone NOT NULL,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_dates_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "deal_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"address" text NOT NULL,
	"parcel_pin" text,
	"status" "deal_status" DEFAULT 'watching' NOT NULL,
	"list_price" integer,
	"notes" text,
	"mutual_acceptance_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"filename" text NOT NULL,
	"doc_type" "document_type" DEFAULT 'unknown' NOT NULL,
	"page_count" integer,
	"is_scanned" boolean,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "documents_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"deal_date_id" uuid NOT NULL,
	"offset_key" text NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sends_once" UNIQUE("deal_date_id","offset_key")
);
--> statement-breakpoint
ALTER TABLE "reminder_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"run_id" uuid NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"page" integer NOT NULL,
	"quote" text NOT NULL,
	"question_to_ask" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'queued' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"findings_dropped" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "review_runs_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "review_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "term_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"closing_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_sheets_one_per_deal" UNIQUE("deal_id")
);
--> statement-breakpoint
ALTER TABLE "term_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comp_sets" ADD CONSTRAINT "comp_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comp_sets" ADD CONSTRAINT "comp_sets_deal_id_user_id_deals_id_user_id_fk" FOREIGN KEY ("deal_id","user_id") REFERENCES "public"."deals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_dates" ADD CONSTRAINT "deal_dates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_dates" ADD CONSTRAINT "deal_dates_deal_id_user_id_deals_id_user_id_fk" FOREIGN KEY ("deal_id","user_id") REFERENCES "public"."deals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deal_id_user_id_deals_id_user_id_fk" FOREIGN KEY ("deal_id","user_id") REFERENCES "public"."deals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_deal_date_id_user_id_deal_dates_id_user_id_fk" FOREIGN KEY ("deal_date_id","user_id") REFERENCES "public"."deal_dates"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_run_id_user_id_review_runs_id_user_id_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."review_runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_document_id_user_id_documents_id_user_id_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_sheets" ADD CONSTRAINT "term_sheets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_sheets" ADD CONSTRAINT "term_sheets_deal_id_user_id_deals_id_user_id_fk" FOREIGN KEY ("deal_id","user_id") REFERENCES "public"."deals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_dates_deal_idx" ON "deal_dates" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deal_dates_due_idx" ON "deal_dates" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "deals_user_idx" ON "deals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_findings_run_idx" ON "review_findings" USING btree ("run_id");--> statement-breakpoint
CREATE POLICY "comp_sets_owner_all" ON "comp_sets" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deal_dates_owner_all" ON "deal_dates" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deals_owner_all" ON "deals" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "documents_owner_all" ON "documents" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "reminder_sends_owner_all" ON "reminder_sends" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "review_findings_owner_all" ON "review_findings" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "review_runs_owner_all" ON "review_runs" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "term_sheets_owner_all" ON "term_sheets" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));