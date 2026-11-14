CREATE TYPE "public"."whatsapp_chat_state" AS ENUM('menu', 'taxi_mode', 'taxi_from', 'taxi_to', 'taxi_address', 'taxi_passengers', 'taxi_confirm', 'rate', 'human');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_message_status" AS ENUM('received', 'sent', 'logged', 'outside_window', 'failed');--> statement-breakpoint
CREATE TABLE "whatsapp_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"profile_name" text,
	"user_id" uuid,
	"state" "whatsapp_chat_state" DEFAULT 'menu' NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_inbound_at" timestamp with time zone NOT NULL,
	"human_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_chats_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"direction" "whatsapp_direction" NOT NULL,
	"wa_message_id" text,
	"body" text NOT NULL,
	"status" "whatsapp_message_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_waMessageId_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_ride_notices" (
	"ride_id" uuid NOT NULL,
	"status" "taxi_ride_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_ride_notices_ride_id_status_pk" PRIMARY KEY("ride_id","status")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_chats" ADD CONSTRAINT "whatsapp_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_chat_id_whatsapp_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."whatsapp_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_ride_notices" ADD CONSTRAINT "whatsapp_ride_notices_ride_id_taxi_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_chats_last_inbound_idx" ON "whatsapp_chats" USING btree ("last_inbound_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_chat_idx" ON "whatsapp_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_created_idx" ON "whatsapp_messages" USING btree ("created_at");