ALTER TABLE "bookings" ADD COLUMN "trip_pack_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD COLUMN "accepts_trip_packs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_pack_id_trip_packs_id_fk" FOREIGN KEY ("trip_pack_id") REFERENCES "public"."trip_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_trip_pack_idx" ON "bookings" USING btree ("trip_pack_id","status");