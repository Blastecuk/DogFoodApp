/**
 * Manufacturer adapter contract.
 *
 * The manufacturer owns stock, picking, packing, approved-courier selection,
 * courier booking, label generation and physical dispatch on its own account.
 * iii.dev only submits a works order (idempotently) and records the reference and
 * returned parcel/tracking data. It never buys postage or creates a label.
 *
 * The prototype ships a FakeManufacturerAdapter with deterministic scenarios
 * selected by TEST FIXTURE (never by a production route or browser flag). The
 * real manufacturer implementation (SFTP/portal/API) is a TODO-CONTRACT.
 */

export type WorksOrderItem = {
  sku: string
  quantity: number
}

export type SubmitWorksOrderInput = {
  /** Stable idempotency key — the commerce order id. Resubmits must not duplicate. */
  idempotencyKey: string
  orderId: string
  items: WorksOrderItem[]
}

export type SubmitResult =
  | { outcome: 'accepted'; manufacturerRef: string }
  | { outcome: 'retryable_error'; reason: string }
  | { outcome: 'timeout' }
  | { outcome: 'rejected'; reason: string }

export type LookupResult =
  | { found: true; manufacturerRef: string }
  | { found: false }

export interface ManufacturerAdapter {
  /** Submit (or resubmit) a works order. Must be safe to retry with the same key. */
  submitWorksOrder(input: SubmitWorksOrderInput): Promise<SubmitResult>
  /** Ambiguous-timeout recovery: has a works order for this key already landed? */
  lookupWorksOrder(idempotencyKey: string): Promise<LookupResult>
}

/** Deterministic scenarios the fake adapter can be driven through (test fixtures). */
export type FakeScenario =
  | 'accept_immediately'
  | 'accept_after_retry'
  | 'ambiguous_timeout_then_lookup_found'
  | 'reject_out_of_stock'

export class FakeManufacturerAdapter implements ManufacturerAdapter {
  // Per-key attempt counter so scenarios like accept_after_retry are deterministic.
  private attempts = new Map<string, number>()
  // Works orders the manufacturer has actually created (even if the caller saw a timeout).
  private landed = new Map<string, string>()

  constructor(private scenario: FakeScenario = 'accept_immediately') {}

  setScenario(scenario: FakeScenario) {
    this.scenario = scenario
  }

  async submitWorksOrder(input: SubmitWorksOrderInput): Promise<SubmitResult> {
    const n = (this.attempts.get(input.idempotencyKey) ?? 0) + 1
    this.attempts.set(input.idempotencyKey, n)

    switch (this.scenario) {
      case 'accept_immediately': {
        const ref = this.accept(input.idempotencyKey)
        return { outcome: 'accepted', manufacturerRef: ref }
      }
      case 'accept_after_retry': {
        if (n < 2) return { outcome: 'retryable_error', reason: 'temporary_upstream_error' }
        const ref = this.accept(input.idempotencyKey)
        return { outcome: 'accepted', manufacturerRef: ref }
      }
      case 'ambiguous_timeout_then_lookup_found': {
        // The works order actually landed, but the caller sees a timeout.
        this.accept(input.idempotencyKey)
        return { outcome: 'timeout' }
      }
      case 'reject_out_of_stock':
        return { outcome: 'rejected', reason: 'out_of_stock' }
    }
  }

  async lookupWorksOrder(idempotencyKey: string): Promise<LookupResult> {
    const ref = this.landed.get(idempotencyKey)
    return ref ? { found: true, manufacturerRef: ref } : { found: false }
  }

  private accept(key: string): string {
    const existing = this.landed.get(key)
    if (existing) return existing
    const ref = `WO-${key.slice(-8).toUpperCase()}`
    this.landed.set(key, ref)
    return ref
  }
}
