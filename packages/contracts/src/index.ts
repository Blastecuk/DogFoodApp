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
  subscription: 'sub',
  shipment: 'shp',
  event: 'evt',
} as const

export type IdPrefix = (typeof IdPrefixes)[keyof typeof IdPrefixes]

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
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
