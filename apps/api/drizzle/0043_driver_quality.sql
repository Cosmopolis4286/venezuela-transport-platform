ALTER TYPE "public"."notification_kind" ADD VALUE 'driver_quality';--> statement-breakpoint
CREATE TABLE "driver_quality_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"average" double precision,
	"ratings" smallint NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"lift_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_quality_actions" ADD CONSTRAINT "driver_quality_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_quality_actions" ADD CONSTRAINT "driver_quality_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_quality_actions" ADD CONSTRAINT "driver_quality_actions_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_quality_active_suspension_key" ON "driver_quality_actions" USING btree ("user_id","organization_id") WHERE "driver_quality_actions"."kind" = 'suspension' and "driver_quality_actions"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "driver_quality_user_idx" ON "driver_quality_actions" USING btree ("user_id","created_at");