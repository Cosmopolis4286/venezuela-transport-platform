CREATE TABLE "driver_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"online_since" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_presence" ADD CONSTRAINT "driver_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_presence_online_idx" ON "driver_presence" USING btree ("last_seen_at") WHERE "driver_presence"."online_since" is not null;