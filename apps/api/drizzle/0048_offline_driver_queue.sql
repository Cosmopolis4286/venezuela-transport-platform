ALTER TABLE "cash_sales" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sales_driver_client_idx" ON "cash_sales" USING btree ("driver_user_id","client_id");