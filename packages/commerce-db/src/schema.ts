import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * Commerce tables owned exclusively by iii.dev and managed by Drizzle Kit.
 * These live in the `commerce` schema of commerce_db. Better Auth owns its own
 * tables (customer identity) separately. Payload has no access to this database.
 *
 * This is a starting subset of the architecture spec §10 core tables; further
 * tables (subscriptions, shipments, promotions, redemptions, inbox, CRM cases)
 * are added in later phases.
 */
export const commerce = pgSchema('commerce')

/** Accepted commerce read model — the source of truth for checkout price/VAT/active. */
export const catalogSkus = commerce.table(
  'catalog_skus',
  {
    id: text('id').primaryKey(),
    productSlug: text('product_slug').notNull(),
    variantLabel: text('variant_label').notNull(),
    supplierSku: text('supplier_sku'),
    pricePence: integer('price_pence').notNull(),
    vatRateBps: integer('vat_rate_bps').notNull().default(2000),
    active: boolean('active').notNull().default(true),
    catalogVersion: integer('catalog_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('catalog_skus_slug_variant_uq').on(t.productSlug, t.variantLabel)],
)

export const carts = commerce.table('carts', {
  id: text('id').primaryKey(),
  customerId: text('customer_id'),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cartItems = commerce.table('cart_items', {
  id: text('id').primaryKey(),
  cartId: text('cart_id')
    .notNull()
    .references(() => carts.id, { onDelete: 'cascade' }),
  skuId: text('sku_id')
    .notNull()
    .references(() => catalogSkus.id),
  quantity: integer('quantity').notNull().default(1),
})

export const orders = commerce.table('orders', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  status: text('status').notNull().default('pending'),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  fulfilmentStatus: text('fulfilment_status').notNull().default('none'),
  totalPence: integer('total_pence').notNull(),
  currency: text('currency').notNull().default('GBP'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const orderItems = commerce.table('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  skuId: text('sku_id').notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPricePence: integer('unit_price_pence').notNull(),
})

/**
 * Server-priced, expiring checkout quotes. Prices are copied from catalog_skus
 * at quote time (never trusted from the browser). A quote is only valid until
 * expiresAt and must be revalidated before payment.
 */
export const pricingQuotes = commerce.table('pricing_quotes', {
  id: text('id').primaryKey(),
  customerId: text('customer_id'),
  currency: text('currency').notNull().default('GBP'),
  catalogVersion: integer('catalog_version').notNull().default(1),
  lineItems: jsonb('line_items').notNull(),
  subtotalPence: integer('subtotal_pence').notNull(),
  vatPence: integer('vat_pence').notNull(),
  discountPence: integer('discount_pence').notNull().default(0),
  promotionCode: text('promotion_code'),
  totalPence: integer('total_pence').notNull(),
  status: text('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Activated, checkout-authoritative discount codes (Neon owns these; Payload
 * only holds editable promotion proposals). Redemptions/reservations are tracked
 * separately so a code cannot be over-used.
 */
export const promotions = commerce.table('promotions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  kind: text('kind').notNull().default('fixed'), // 'fixed' | 'percentage'
  value: integer('value').notNull(), // fixed: pence off; percentage: percent 0-100
  firstOrderOnly: boolean('first_order_only').notNull().default(false),
  active: boolean('active').notNull().default(true),
  maxRedemptions: integer('max_redemptions'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const promotionRedemptions = commerce.table('promotion_redemptions', {
  id: text('id').primaryKey(),
  promotionId: text('promotion_id')
    .notNull()
    .references(() => promotions.id, { onDelete: 'cascade' }),
  quoteId: text('quote_id'),
  customerId: text('customer_id'),
  amountPence: integer('amount_pence').notNull(),
  status: text('status').notNull().default('reserved'), // 'reserved' | 'redeemed' | 'released'
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Manufacturer works orders. One per commerce order (idempotency key = order id),
 * so re-submitting a paid order never creates a duplicate works order. The
 * manufacturer owns picking/packing/dispatch; we only record its reference/state.
 */
export const manufacturerWorksOrders = commerce.table('manufacturer_works_orders', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' })
    .unique(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status').notNull().default('pending'), // pending | accepted | rejected
  manufacturerRef: text('manufacturer_ref'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Shipments (parcels). The manufacturer books the courier and returns the carrier
 * + tracking number; we register that existing number with the tracking provider
 * and persist normalised status. iii.dev never buys postage or creates a label.
 */
export const shipments = commerce.table(
  'shipments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    carrierCode: text('carrier_code').notNull(),
    trackingNumber: text('tracking_number').notNull(),
    status: text('status').notNull().default('registered'),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('shipments_carrier_tracking_uq').on(t.carrierCode, t.trackingNumber)],
)

/** Normalised, deduplicated tracking events (source: fake tracker / AfterShip). */
export const trackingEvents = commerce.table(
  'tracking_events',
  {
    id: text('id').primaryKey(),
    shipmentId: text('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    providerEventId: text('provider_event_id').notNull(),
    status: text('status').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tracking_events_shipment_provider_uq').on(t.shipmentId, t.providerEventId)],
)

/** Operational cases (CRM). Opened for manufacturer/courier exceptions. */
export const operationalCases = commerce.table('operational_cases', {
  id: text('id').primaryKey(),
  orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  detail: text('detail'),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Provider webhook dedupe log. A webhook is only processed once; the primary key
 * is the provider event id, so a replayed/duplicated webhook is a no-op.
 */
export const webhookEvents = commerce.table('webhook_events', {
  id: text('id').primaryKey(), // provider event id (e.g. Stripe evt_...)
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
})

/** Transactional outbox — paid-order state and event are committed atomically. */
export const outboxEvents = commerce.table(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('outbox_idempotency_uq').on(t.idempotencyKey)],
)

export const schema = {
  catalogSkus,
  carts,
  cartItems,
  orders,
  orderItems,
  pricingQuotes,
  promotions,
  promotionRedemptions,
  manufacturerWorksOrders,
  shipments,
  trackingEvents,
  operationalCases,
  webhookEvents,
  outboxEvents,
}

export { sql }
