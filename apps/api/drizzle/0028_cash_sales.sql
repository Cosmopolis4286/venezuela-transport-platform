CREATE TABLE "cash_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"from_stop_id" uuid NOT NULL,
	"to_stop_id" uuid NOT NULL,
	"passengers" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"service_date" date NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_sales_passengers_check" CHECK ("cash_sales"."passengers" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_from_stop_id_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_to_stop_id_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_sales_organization_date_idx" ON "cash_sales" USING btree ("organization_id","service_date");--> statement-breakpoint
CREATE INDEX "cash_sales_driver_date_idx" ON "cash_sales" USING btree ("driver_user_id","service_date");