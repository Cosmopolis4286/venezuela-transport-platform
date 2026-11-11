ALTER TABLE "settlement_entries" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "trip_pack_id" uuid;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD COLUMN "taxi_ride_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_trip_pack_id_trip_packs_id_fk" FOREIGN KEY ("trip_pack_id") REFERENCES "public"."trip_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD CONSTRAINT "settlement_entries_taxi_ride_id_taxi_rides_id_fk" FOREIGN KEY ("taxi_ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entries_taxi_ride_kind_key" ON "settlement_entries" USING btree ("taxi_ride_id","kind");--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD CONSTRAINT "settlement_entries_subject_check" CHECK (("settlement_entries"."booking_id" is null) <> ("settlement_entries"."taxi_ride_id" is null));