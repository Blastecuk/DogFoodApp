CREATE SCHEMA "commerce";
--> statement-breakpoint
CREATE TABLE "commerce"."cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce"."carts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce"."catalog_skus" (
	"id" text PRIMARY KEY NOT NULL,
	"product_slug" text NOT NULL,
	"variant_label" text NOT NULL,
	"supplier_sku" text,
	"price_pence" integer NOT NULL,
	"vat_rate_bps" integer DEFAULT 2000 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"catalog_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce"."order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_pence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce"."orders" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"fulfilment_status" text DEFAULT 'none' NOT NULL,
	"total_pence" integer NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"stripe_checkout_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce"."outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "commerce"."cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "commerce"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce"."cart_items" ADD CONSTRAINT "cart_items_sku_id_catalog_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "commerce"."catalog_skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_skus_slug_variant_uq" ON "commerce"."catalog_skus" USING btree ("product_slug","variant_label");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_idempotency_uq" ON "commerce"."outbox_events" USING btree ("idempotency_key");