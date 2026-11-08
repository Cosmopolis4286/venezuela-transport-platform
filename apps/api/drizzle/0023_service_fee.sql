ALTER TABLE "bookings" ADD COLUMN "service_fee" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "service_fee_rate" numeric(5, 2);--> statement-breakpoint
-- ADR-029: the platform's 15 % service fee on top of the fare is the general rule (it was an 8 %
-- commission inside the fare). Only the untouched default changes; an edited value is kept.
UPDATE "platform_settings" SET "commission_rate" = 15.00 WHERE "id" = 1 AND "commission_rate" = 8.00;
