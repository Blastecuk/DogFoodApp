import { z } from 'zod'

/**
 * Shared contracts, IDs, money/VAT helpers and event envelopes (P0).
 * All monetary amounts are integer pence to avoid floating-point drift.
 */

export const UK_STANDARD_VAT_RATE = 0.2

/** Money is always integer pence. */
export const Pence = z.number().int().nonnegative()
export type Pence = z.infer<typeof Pence>

/** Add VAT to a net (ex-VAT) amount in pence, rounding to the nearest penny. */
export function addVat(netPence: number, rate: number = UK_STANDARD_VAT_RATE): number {
  return Math.round(netPence * (1 + rate))
}

/** Extract the VAT portion from a gross (inc-VAT) amount in pence. */
export function vatFromGross(grossPence: number, rate: number = UK_STANDARD_VAT_RATE): number {
  return grossPence - Math.round(grossPence / (1 + rate))
}

/** Prefixed, sortable-ish identifiers, e.g. `order_...`. */
export const IdPrefixes = {
  order: 'order',
  cart: 'cart',
  sku: 'sku',
  quote: 'quote',
  subscription: 'sub',
  shipment: 'shp',
  event: 'evt',
} as const

export type IdPrefix = (typeof IdPrefixes)[keyof typeof IdPrefixes]

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '')}`
}

/** Canonical event envelope carried through outbox → RabbitMQ → inbox. */
export const EventEnvelope = z.object({
  id: z.string(),
  type: z.string(),
  occurredAt: z.string().datetime(),
  correlationId: z.string(),
  /** Idempotency key consumers use to deduplicate side effects. */
  idempotencyKey: z.string(),
  payload: z.record(z.string(), z.unknown()),
})
export type EventEnvelope = z.infer<typeof EventEnvelope>

/** The only roles in the platform. */
export const Role = z.enum(['superadmin', 'admin', 'user'])
export type Role = z.infer<typeof Role>

/**
 * Catalogue sync contract — Payload pushes approved product/variant pricing to
 * iii.dev's signed private endpoint, which commits it to the commerce
 * `catalog_skus` read model. iii.dev NEVER reads payload_db; Payload NEVER writes
 * commerce tables directly. Requests are HMAC-signed with a shared secret over the
 * raw body, hex(sha256), and carry an audience the receiver checks.
 */
export const CatalogSyncSku = z.object({
  productSlug: z.string().min(1),
  variantLabel: z.string().min(1),
  supplierSku: z.string().nullish(),
  pricePence: Pence,
  vatRateBps: z.number().int().min(0).max(10000).default(2000),
  active: z.boolean().default(true),
})
export type CatalogSyncSku = z.infer<typeof CatalogSyncSku>

export const CatalogSyncRequest = z.object({
  source: z.string().default('payload'),
  audience: z.string(),
  catalogVersion: z.number().int().positive().default(1),
  skus: z.array(CatalogSyncSku).min(1),
})
export type CatalogSyncRequest = z.infer<typeof CatalogSyncRequest>

/**
 * Checkout quote request. The browser may specify ONLY sku + quantity — never
 * prices. iii.dev prices the quote authoritatively from catalog_skus.
 */
export const QuoteItem = z.object({
  skuId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
})
export type QuoteItem = z.infer<typeof QuoteItem>

export const QuoteRequest = z.object({
  items: z.array(QuoteItem).min(1),
  customerId: z.string().nullish(),
})
export type QuoteRequest = z.infer<typeof QuoteRequest>

/** Short-lived BFF token claims (issuer/audience/subject/role/expiry/correlation). */
export const BffTokenClaims = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  role: Role,
  exp: z.number().int(),
  correlationId: z.string(),
})
export type BffTokenClaims = z.infer<typeof BffTokenClaims>
