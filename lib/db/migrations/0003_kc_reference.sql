CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"etag" text,
	"last_modified" text,
	"rows" integer NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kc_parcels" (
	"pin" text PRIMARY KEY NOT NULL,
	"area" integer,
	"sub_area" integer,
	"prop_type" text,
	"present_use" integer,
	"sq_ft_lot" integer,
	"current_zoning" text,
	"district_name" text,
	"address" text,
	"zip" text,
	"lat" double precision,
	"lon" double precision,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kc_parcels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kc_res_buildings" (
	"pin" text NOT NULL,
	"bldg_nbr" integer NOT NULL,
	"address" text,
	"zip" text,
	"nbr_living_units" integer,
	"stories" numeric(3, 1),
	"bldg_grade" integer,
	"sq_ft_tot_living" integer,
	"sq_ft_tot_basement" integer,
	"sq_ft_fin_basement" integer,
	"bedrooms" integer,
	"bath_full" integer,
	"bath_3qtr" integer,
	"bath_half" integer,
	"yr_built" integer,
	"yr_renovated" integer,
	"condition" integer,
	CONSTRAINT "kc_res_buildings_pin_bldg_nbr_pk" PRIMARY KEY("pin","bldg_nbr")
);
--> statement-breakpoint
ALTER TABLE "kc_res_buildings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kc_sales" (
	"excise_tax_nbr" text NOT NULL,
	"pin" text NOT NULL,
	"document_date" date NOT NULL,
	"sale_price" integer NOT NULL,
	"property_type" integer,
	"principal_use" integer,
	"sale_instrument" integer,
	"sale_reason" integer,
	"property_class" integer,
	"sale_warning" text,
	CONSTRAINT "kc_sales_excise_tax_nbr_pin_pk" PRIMARY KEY("excise_tax_nbr","pin")
);
--> statement-breakpoint
ALTER TABLE "kc_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ingest_runs_source_idx" ON "ingest_runs" USING btree ("source","loaded_at");--> statement-breakpoint
CREATE INDEX "kc_parcels_area_idx" ON "kc_parcels" USING btree ("area","sub_area");--> statement-breakpoint
CREATE INDEX "kc_parcels_latlon_idx" ON "kc_parcels" USING btree ("lat","lon");--> statement-breakpoint
CREATE INDEX "kc_parcels_address_idx" ON "kc_parcels" USING btree ("address");--> statement-breakpoint
CREATE INDEX "kc_sales_pin_idx" ON "kc_sales" USING btree ("pin");--> statement-breakpoint
CREATE INDEX "kc_sales_date_idx" ON "kc_sales" USING btree ("document_date");--> statement-breakpoint
CREATE POLICY "kc_parcels_read_all" ON "kc_parcels" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "kc_res_buildings_read_all" ON "kc_res_buildings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "kc_sales_read_all" ON "kc_sales" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);