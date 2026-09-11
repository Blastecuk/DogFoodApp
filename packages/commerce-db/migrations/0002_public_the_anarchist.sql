CREATE TABLE "commerce"."promotion_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"promotion_id" text NOT NULL,
	"quote_id" text,
	"customer_id" text,
	"amount_pence" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce"."promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'fixed' NOT NULL,
	"value" integer NOT NULL,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"max_redemptions" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "commerce"."pricing_quotes" ADD COLUMN "discount_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce"."pricing_quotes" ADD COLUMN "promotion_code" text;--> statement-breakpoint
ALTER TABLE "commerce"."promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "commerce"."promotions"("id") ON DELETE cascade ON UPDATE no action;