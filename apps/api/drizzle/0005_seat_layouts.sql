CREATE TABLE "seat_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"decks" smallint NOT NULL,
	"rows" smallint NOT NULL,
	"columns" smallint NOT NULL,
	"seats" jsonb NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_schedules" ADD COLUMN "seat_layout_id" uuid;--> statement-breakpoint
ALTER TABLE "seat_layouts" ADD CONSTRAINT "seat_layouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seat_layouts_organization_idx" ON "seat_layouts" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_seat_layout_id_seat_layouts_id_fk" FOREIGN KEY ("seat_layout_id") REFERENCES "public"."seat_layouts"("id") ON DELETE restrict ON UPDATE no action;