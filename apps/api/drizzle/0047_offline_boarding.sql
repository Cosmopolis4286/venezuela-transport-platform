CREATE TYPE "public"."boarding_issue_kind" AS ENUM('double_use', 'not_paid');--> statement-breakpoint
CREATE TABLE "boarding_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"kind" "boarding_issue_kind" NOT NULL,
	"first_boarded_at" timestamp with time zone,
	"first_user_id" uuid,
	"second_boarded_at" timestamp with time zone NOT NULL,
	"second_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boarding_issues" ADD CONSTRAINT "boarding_issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boarding_issues" ADD CONSTRAINT "boarding_issues_passenger_id_booking_passengers_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."booking_passengers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boarding_issues" ADD CONSTRAINT "boarding_issues_first_user_id_users_id_fk" FOREIGN KEY ("first_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boarding_issues" ADD CONSTRAINT "boarding_issues_second_user_id_users_id_fk" FOREIGN KEY ("second_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boarding_issues_once_key" ON "boarding_issues" USING btree ("passenger_id","kind","second_user_id");--> statement-breakpoint
CREATE INDEX "boarding_issues_organization_idx" ON "boarding_issues" USING btree ("organization_id","created_at");