import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Tracking adapter contract.
 *
 * Models AfterShip's production responsibility: register an EXISTING tracking
 * number (from the manufacturer), receive signed webhook fixtures, deduplicate
 * events and normalise carrier statuses. It must NOT buy postage or create a
 * courier label. `FakeTrackingAdapter` is the prototype; AfterShip is production.
 */

/** Approved fixture couriers (real approved-courier mapping is a TODO-CONTRACT). */
export const APPROVED_CARRIERS = ['ROYAL_MAIL', 'DPD', 'EVRI'] as const

/** Normalised tracking statuses (superset used across the platform). */
export type TrackingStatus =
  | 'registered'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'delayed'
  | 'exception'
  | 'returned'

/** Rank used to ignore out-of-order regressions (higher = later in lifecycle). */
export const STATUS_RANK: Record<TrackingStatus, number> = {
  registered: 0,
  in_transit: 1,
  out_for_delivery: 2,
  delayed: 2,
  exception: 2,
  delivered: 3,
  returned: 3,
}

export type NormalisedEvent = {
  providerEventId: string
  carrierCode: string
  trackingNumber: string
  status: TrackingStatus
  occurredAt: Date
}

export interface TrackingAdapter {
  /** Register an existing tracking number (no postage/label purchase). */
  register(input: { carrierCode: string; trackingNumber: string }): Promise<{ registered: boolean }>
  /** Verify the provider webhook signature over the raw body. */
  verifySignature(rawBody: string, signature: string): boolean
  /** Normalise a provider webhook payload into our canonical event. */
  normalise(rawBody: string): NormalisedEvent
}

const TAG_TO_STATUS: Record<string, TrackingStatus> = {
  InfoReceived: 'registered',
  InTransit: 'in_transit',
  OutForDelivery: 'out_for_delivery',
  Delivered: 'delivered',
  Delayed: 'delayed',
  Exception: 'exception',
  ReturnedToSender: 'returned',
}

export class FakeTrackingAdapter implements TrackingAdapter {
  constructor(private webhookSecret: string) {}

  async register(input: { carrierCode: string; trackingNumber: string }) {
    // AfterShip create-tracking is registration only — never postage/label.
    return { registered: Boolean(input.carrierCode && input.trackingNumber) }
  }

  sign(rawBody: string): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody, 'utf8').digest('hex')
  }

  verifySignature(rawBody: string, signature: string): boolean {
    if (!signature) return false
    const expected = this.sign(rawBody)
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  normalise(rawBody: string): NormalisedEvent {
    const p = JSON.parse(rawBody) as {
      id: string
      tag: string
      carrier: string
      tracking_number: string
      occurred_at: string
    }
    return {
      providerEventId: p.id,
      carrierCode: p.carrier,
      trackingNumber: p.tracking_number,
      status: TAG_TO_STATUS[p.tag] ?? 'in_transit',
      occurredAt: new Date(p.occurred_at),
    }
  }
}
