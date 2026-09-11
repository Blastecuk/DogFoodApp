CREATE TABLE "commerce"."pricing_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"catalog_version" integer DEFAULT 1 NOT NULL,
	"line_items" jsonb NOT NULL,
	"subtotal_pence" integer NOT NULL,
	"vat_pence" integer NOT NULL,
	"total_pence" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
