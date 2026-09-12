import 'dotenv/config'
import { serve } from '@hono/node-server'
import { and, eq, inArray } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import Stripe from 'stripe'
import { FakeTrackingAdapter, STATUS_RANK, type TrackingStatus } from '@dogfood/tracking-adapter'
import { db, pool, schema } from '@dogfood/commerce-db'
import { sql } from 'drizzle-orm'
import { CatalogSyncRequest, CONTRIBUTION_FLOOR_BPS, newId, QuoteRequest, vatFromGross } from '@dogfood/contracts'
import { SYNC_SIGNATURE_HEADER, verifyBody } from '@dogfood/contracts/signing'

/**
 * iii.dev HTTP API (Fly.io `api` process group).
 *
 * Owns commerce business rules and reads/writes commerce_db via the least-
 * privilege `commerce_runtime` role. Storefront/Payload call these endpoints
 * (via same-origin BFF); they never touch commerce tables directly.
 *
 * This P1 slice exposes a health check and the catalogue read model.
 */
const app = new Hono()
const region = process.env.FLY_PRIMARY_REGION ?? 'local'

const tracker = new FakeTrackingAdapter(process.env.TRACKING_WEBHOOK_SECRET ?? 'unset-tracking-secret')

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
// A Stripe instance is needed for webhook signature verification (crypto only —
// no API call), so it works even without a real secret key configured.
const stripe = new Stripe(stripeKey ?? 'sk_test_placeholder')
const appUrl = process.env.STOREFRONT_URL ?? 'http://localhost:3001'

app.get('/health', async (c) => {
  try {
    await pool.query('SELECT 1')
    return c.json({ status: 'ok', db: 'up', region, ts: new Date().toISOString() })
  } catch {
    return c.json({ status: 'degraded', db: 'down', region, ts: new Date().toISOString() }, 503)
  }
})

/**
 * Tracking webhook (fake tracker in prototype; AfterShip in production). Verifies
 * the signature over the raw body, normalises the status, dedupes by provider
 * event id per shipment, and advances the shipment status without regressing on
 * out-of-order events. Duplicate events are a no-op.
 */
app.post('/webhooks/tracking/:carrier', async (c) => {
  const raw = await c.req.text()
  const sig = c.req.header('aftership-hmac-sha256') ?? c.req.header('x-tracking-signature') ?? ''
  if (!tracker.verifySignature(raw, sig)) {
    return c.json({ error: 'invalid_signature' }, 400)
  }

  let ev
  try {
    ev = tracker.normalise(raw)
  } catch {
    return c.json({ error: 'invalid_payload' }, 422)
  }

  const [shipment] = await db
    .select()
    .from(schema.shipments)
    .where(
      and(
        eq(schema.shipments.carrierCode, ev.carrierCode),
        eq(schema.shipments.trackingNumber, ev.trackingNumber),
      ),
    )
    .limit(1)
  if (!shipment) return c.json({ error: 'shipment_not_found' }, 404)

  const client = await pool.connect()
  try {
    const dedupe = await client.query(
      `INSERT INTO commerce.tracking_events (id, shipment_id, provider_event_id, status, occurred_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (shipment_id, provider_event_id) DO NOTHING`,
      [newId('evt'), shipment.id, ev.providerEventId, ev.status, ev.occurredAt],
    )
    if (dedupe.rowCount === 0) {
      return c.json({ ok: true, deduped: true })
    }

    // Advance status only if this event is not an out-of-order regression.
    const currentRank = STATUS_RANK[(shipment.status as TrackingStatus)] ?? 0
    const incomingRank = STATUS_RANK[ev.status] ?? 0
    let applied = false
    if (incomingRank >= currentRank) {
      await client.query(
        `UPDATE commerce.shipments SET status=$2, last_event_at=$3 WHERE id=$1`,
        [shipment.id, ev.status, ev.occurredAt],
      )
      applied = true
    }
    if (ev.status === 'exception' || ev.status === 'returned') {
      await client.query(
        `INSERT INTO commerce.operational_cases (id, order_id, kind, detail, status)
         VALUES ($1,$2,'tracking_exception',$3,'open')`,
        [newId('evt'), shipment.orderId, `${ev.carrierCode}:${ev.trackingNumber} ${ev.status}`],
      )
    }
    return c.json({ ok: true, status: ev.status, applied })
  } finally {
    client.release()
  }
})

// --- Staff (/ops) authorization -------------------------------------------
// Short-lived staff token minted by the Payload BFF. Compact HMAC token:
//   base64url(claims) + "." + hex(hmac_sha256(secret, base64url(claims)))
// Production uses asymmetric keys (III_STAFF_TOKEN_VERIFY_PUBLIC_KEY); the
// prototype uses a shared secret. Fly re-authorises the token + role here.
const staffTokenSecret = process.env.III_STAFF_TOKEN_SECRET ?? 'unset-staff-secret'
const staffAudience = process.env.III_STAFF_TOKEN_AUDIENCE ?? 'iii-ops-api'

type StaffClaims = { sub: string; role: string; aud: string; exp: number; iss?: string; correlationId?: string }

function verifyStaffToken(authHeader: string | undefined): StaffClaims | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const [part, sig] = token.split('.')
  if (!part || !sig) return null
  if (!verifyBody(staffTokenSecret, part, sig)) return null
  let claims: StaffClaims
  try {
    claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (claims.aud !== staffAudience) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null
  if (claims.role !== 'superadmin' && claims.role !== 'admin') return null
  return claims
}

/** Guard: returns claims or writes a 401 JSON response. */
function requireStaff(c: Context): StaffClaims | Response {
  const claims = verifyStaffToken(c.req.header('authorization'))
  if (!claims) return c.json({ error: 'unauthorized' }, 401)
  return claims
}

async function orderDetail(id: string) {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1)
  if (!order) return null
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id))
  const [wo] = await db
    .select()
    .from(schema.manufacturerWorksOrders)
    .where(eq(schema.manufacturerWorksOrders.orderId, id))
    .limit(1)
  const ships = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id))
  const shipmentViews = []
  for (const s of ships) {
    const events = await db
      .select()
      .from(schema.trackingEvents)
      .where(eq(schema.trackingEvents.shipmentId, s.id))
    shipmentViews.push({
      carrierCode: s.carrierCode,
      trackingNumber: s.trackingNumber,
      status: s.status,
      events: events
        .map((e) => ({ status: e.status, occurredAt: e.occurredAt }))
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    })
  }
  const cases = await db
    .select()
    .from(schema.operationalCases)
    .where(eq(schema.operationalCases.orderId, id))
  return { order, items, worksOrder: wo ?? null, shipments: shipmentViews, cases }
}

/** Staff order search/list (protected /ops; not ownership-scoped). */
app.get('/ops/orders', async (c) => {
  const staff = requireStaff(c)
  if (staff instanceof Response) return staff
  const rows = await db.select().from(schema.orders).orderBy(schema.orders.createdAt)
  return c.json({
    orders: rows.map((o) => ({
      id: o.id,
      customerId: o.customerId,
      paymentStatus: o.paymentStatus,
      fulfilmentStatus: o.fulfilmentStatus,
      totalPence: o.totalPence,
      createdAt: o.createdAt,
    })),
  })
})

/** Staff order detail — the SAME committed state the customer sees, plus ops data. */
app.get('/ops/orders/:id', async (c) => {
  const staff = requireStaff(c)
  if (staff instanceof Response) return staff
  const detail = await orderDetail(c.req.param('id'))
  if (!detail) return c.json({ error: 'not_found' }, 404)
  const { order, items, worksOrder, shipments, cases } = detail
  return c.json({
    id: order.id,
    customerId: order.customerId,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    totalPence: order.totalPence,
    currency: order.currency,
    items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPricePence: i.unitPricePence })),
    worksOrder: worksOrder
      ? { status: worksOrder.status, manufacturerRef: worksOrder.manufacturerRef, attempts: worksOrder.attempts }
      : null,
    shipments,
    cases: cases.map((k) => ({ id: k.id, kind: k.kind, detail: k.detail, status: k.status, createdAt: k.createdAt })),
  })
})

/** Open operational cases across all orders. */
app.get('/ops/cases', async (c) => {
  const staff = requireStaff(c)
  if (staff instanceof Response) return staff
  const rows = await db
    .select()
    .from(schema.operationalCases)
    .where(eq(schema.operationalCases.status, 'open'))
  return c.json({ cases: rows })
})

/** Record a staff operational note/case against an order (audited in Neon). */
app.post('/ops/orders/:id/cases', async (c) => {
  const staff = requireStaff(c)
  if (staff instanceof Response) return staff
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { detail?: string; kind?: string }
  const detail = String(body.detail ?? '').trim()
  if (!detail) return c.json({ error: 'detail_required' }, 400)
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1)
  if (!order) return c.json({ error: 'order_not_found' }, 404)
  const caseId = newId('evt')
  await db.insert(schema.operationalCases).values({
    id: caseId,
    orderId: id,
    kind: body.kind ?? 'staff_note',
    // Audit the acting staff member (from the verified token, not the browser).
    detail: `${detail} — by ${staff.role} ${staff.sub}`,
    status: 'open',
  })
  return c.json({ ok: true, caseId }, 201)
})

/** Customer order list (ownership-scoped; called by the storefront BFF). */
app.get('/commerce/orders', async (c) => {
  const customerId = c.req.query('customerId')
  if (!customerId) return c.json({ error: 'customerId_required' }, 400)
  const rows = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.customerId, customerId))
  return c.json({ orders: rows.map((o) => ({
    id: o.id,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfilmentStatus: o.fulfilmentStatus,
    totalPence: o.totalPence,
    currency: o.currency,
    createdAt: o.createdAt,
  })) })
})

/** Customer order detail with shipments + tracking (ownership enforced). */
app.get('/commerce/orders/:id', async (c) => {
  const customerId = c.req.query('customerId')
  const id = c.req.param('id')
  if (!customerId) return c.json({ error: 'customerId_required' }, 400)

  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1)
  if (!order || order.customerId !== customerId) return c.json({ error: 'not_found' }, 404)

  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id))
  const ships = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id))
  const shipmentViews = []
  for (const s of ships) {
    const events = await db
      .select()
      .from(schema.trackingEvents)
      .where(eq(schema.trackingEvents.shipmentId, s.id))
    shipmentViews.push({
      id: s.id,
      carrierCode: s.carrierCode,
      trackingNumber: s.trackingNumber,
      status: s.status,
      events: events
        .map((e) => ({ status: e.status, occurredAt: e.occurredAt }))
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    })
  }

  return c.json({
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    totalPence: order.totalPence,
    currency: order.currency,
    createdAt: order.createdAt,
    items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPricePence: i.unitPricePence })),
    shipments: shipmentViews,
  })
})

/** Accepted catalogue read model — the source of truth for checkout price/VAT. */
app.get('/commerce/catalog', async (c) => {
  const rows = await db
    .select()
    .from(schema.catalogSkus)
    .where(eq(schema.catalogSkus.active, true))
  return c.json({ skus: rows.map(toSkuView) })
})

app.get('/commerce/catalog/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select()
    .from(schema.catalogSkus)
    .where(and(eq(schema.catalogSkus.id, id), eq(schema.catalogSkus.active, true)))
    .limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(toSkuView(row))
})

const QUOTE_TTL_MS = 15 * 60 * 1000

/**
 * Create a Stripe test Checkout Session from an accepted, unexpired quote. The
 * quote id travels in the session metadata so the paid webhook can create the
 * order from the server-priced snapshot. When no Stripe key is configured we
 * return a simulated session so the prototype flow still works end-to-end.
 */
app.post('/commerce/checkout', async (c) => {
  const { quoteId } = (await c.req.json().catch(() => ({}))) as { quoteId?: string }
  if (!quoteId) return c.json({ error: 'quoteId_required' }, 400)

  const [quote] = await db
    .select()
    .from(schema.pricingQuotes)
    .where(eq(schema.pricingQuotes.id, quoteId))
    .limit(1)
  if (!quote) return c.json({ error: 'quote_not_found' }, 404)
  if (quote.status !== 'active' || quote.expiresAt.getTime() < Date.now()) {
    return c.json({ error: 'quote_invalid', status: quote.status }, 409)
  }

  if (stripeKey) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      metadata: { quoteId },
      success_url: `${appUrl}/account?checkout=success`,
      cancel_url: `${appUrl}/cart?checkout=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: quote.currency.toLowerCase(),
            unit_amount: quote.totalPence,
            product_data: { name: `DogFood order (quote ${quoteId})` },
          },
        },
      ],
    })
    return c.json({ sessionId: session.id, url: session.url, simulated: false })
  }

  // Simulated session (no Stripe key). The webhook test signs an event carrying
  // this session id + quoteId metadata.
  const sessionId = `cs_sim_${newId('evt').split('_')[1]}`
  return c.json({
    sessionId,
    url: `${appUrl}/account?checkout=simulated`,
    simulated: true,
  })
})

/**
 * Stripe webhook. Verifies the raw-body signature, deduplicates by event id, and
 * on a paid checkout commits the order + order items + outbox event atomically
 * (transactional outbox), redeems any reserved promotion and consumes the quote.
 * Duplicate deliveries create no duplicate order.
 */
app.post('/webhooks/stripe', async (c) => {
  if (!stripeWebhookSecret) return c.json({ error: 'webhook_not_configured' }, 500)
  const raw = await c.req.text()
  const sig = c.req.header('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, stripeWebhookSecret)
  } catch (err) {
    return c.json({ error: 'invalid_signature', message: (err as Error).message }, 400)
  }

  const client = await pool.connect()
  try {
    // Dedupe: first writer wins; a replay is a no-op.
    const dedupe = await client.query(
      `INSERT INTO commerce.webhook_events (id, provider, event_type)
       VALUES ($1,'stripe',$2) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type],
    )
    if (dedupe.rowCount === 0) {
      return c.json({ ok: true, deduped: true, eventId: event.id })
    }

    if (event.type !== 'checkout.session.completed') {
      await client.query(`UPDATE commerce.webhook_events SET processed_at = now() WHERE id=$1`, [event.id])
      return c.json({ ok: true, ignored: event.type })
    }

    const session = event.data.object as Stripe.Checkout.Session
    const quoteId = session.metadata?.quoteId
    if (!quoteId) return c.json({ error: 'missing_quote_metadata' }, 400)

    const [quote] = await db
      .select()
      .from(schema.pricingQuotes)
      .where(eq(schema.pricingQuotes.id, quoteId))
      .limit(1)
    if (!quote) return c.json({ error: 'quote_not_found' }, 404)

    // Idempotency guard: one order per checkout session.
    const existing = await client.query(
      `SELECT id FROM commerce.orders WHERE stripe_checkout_session_id = $1 LIMIT 1`,
      [session.id],
    )
    if ((existing.rowCount ?? 0) > 0) {
      await client.query(`UPDATE commerce.webhook_events SET processed_at = now() WHERE id=$1`, [event.id])
      return c.json({ ok: true, alreadyProcessed: true, orderId: existing.rows[0].id })
    }

    const orderId = newId('order')
    const lineItems = quote.lineItems as Array<{
      skuId: string
      productSlug: string
      variantLabel: string
      quantity: number
      unitGrossPence: number
    }>

    await client.query('BEGIN')
    await client.query(
      `INSERT INTO commerce.orders
         (id, customer_id, status, payment_status, fulfilment_status, total_pence, currency, stripe_checkout_session_id)
       VALUES ($1,$2,'paid','paid','pending',$3,$4,$5)`,
      [orderId, quote.customerId, quote.totalPence, quote.currency, session.id],
    )
    for (const li of lineItems) {
      await client.query(
        `INSERT INTO commerce.order_items (id, order_id, sku_id, description, quantity, unit_price_pence)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [newId('item'), orderId, li.skuId, `${li.productSlug} · ${li.variantLabel}`, li.quantity, li.unitGrossPence],
      )
    }
    // Transactional outbox: the paid-order event is committed in the SAME tx.
    await client.query(
      `INSERT INTO commerce.outbox_events (id, event_type, idempotency_key, correlation_id, payload)
       VALUES ($1,'order.paid',$2,$3,$4)`,
      [
        newId('evt'),
        orderId,
        session.id,
        JSON.stringify({ orderId, quoteId, customerId: quote.customerId, totalPence: quote.totalPence }),
      ],
    )
    await client.query(
      `UPDATE commerce.promotion_redemptions SET status='redeemed'
       WHERE quote_id=$1 AND status='reserved'`,
      [quoteId],
    )
    await client.query(`UPDATE commerce.pricing_quotes SET status='consumed' WHERE id=$1`, [quoteId])
    await client.query(`UPDATE commerce.webhook_events SET processed_at = now() WHERE id=$1`, [event.id])
    await client.query('COMMIT')

    return c.json({ ok: true, orderId })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return c.json({ error: 'processing_failed', message: (err as Error).message }, 500)
  } finally {
    client.release()
  }
})

/**
 * Create a server-priced, expiring quote. The browser supplies only sku + qty;
 * every price/VAT is taken from catalog_skus here (never trusted from input).
 */
app.post('/commerce/quotes', async (c) => {
  const parsed = QuoteRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', details: parsed.error.flatten() }, 422)
  }
  const { items, customerId, discountCode } = parsed.data

  const skuIds = [...new Set(items.map((i) => i.skuId))]
  const rows = await db
    .select()
    .from(schema.catalogSkus)
    .where(and(inArray(schema.catalogSkus.id, skuIds), eq(schema.catalogSkus.active, true)))

  const bySku = new Map(rows.map((r) => [r.id, r]))
  const missing = skuIds.filter((id) => !bySku.has(id))
  if (missing.length > 0) {
    return c.json({ error: 'unavailable_skus', skuIds: missing }, 422)
  }

  let subtotalPence = 0
  let vatPence = 0
  let totalPence = 0
  let catalogVersion = 1
  const lineItems = items.map((i) => {
    const sku = bySku.get(i.skuId)!
    const rate = sku.vatRateBps / 10000
    const lineGross = sku.pricePence * i.quantity
    const lineVat = vatFromGross(lineGross, rate)
    totalPence += lineGross
    vatPence += lineVat
    subtotalPence += lineGross - lineVat
    catalogVersion = Math.max(catalogVersion, sku.catalogVersion)
    return {
      skuId: sku.id,
      productSlug: sku.productSlug,
      variantLabel: sku.variantLabel,
      quantity: i.quantity,
      unitGrossPence: sku.pricePence,
      lineGrossPence: lineGross,
      lineVatPence: lineVat,
    }
  })

  const id = newId('quote')
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS)

  // Discount validation + reservation (iii.dev owns this; browser sends only a code).
  let discountPence = 0
  let appliedCode: string | null = null
  let discount: { code: string; amountPence: number } | null = null
  let discountError: string | null = null
  let reservation: { promotionId: string; amountPence: number } | null = null

  if (discountCode) {
    const outcome = await evaluateDiscount({
      code: discountCode,
      grossTotal: totalPence,
      customerId: customerId ?? null,
    })
    if (outcome.ok) {
      discountPence = outcome.amountPence
      appliedCode = outcome.code
      discount = { code: outcome.code, amountPence: outcome.amountPence }
      reservation = { promotionId: outcome.promotionId, amountPence: outcome.amountPence }
    } else {
      discountError = outcome.reason // fail safely — quote still returned at full price
    }
  }

  const payablePence = totalPence - discountPence

  await db.insert(schema.pricingQuotes).values({
    id,
    customerId: customerId ?? null,
    currency: 'GBP',
    catalogVersion,
    lineItems,
    subtotalPence,
    vatPence,
    discountPence,
    promotionCode: appliedCode,
    totalPence: payablePence,
    status: 'active',
    expiresAt,
  })

  if (reservation) {
    await db.insert(schema.promotionRedemptions).values({
      id: newId('redemption'),
      promotionId: reservation.promotionId,
      quoteId: id,
      customerId: customerId ?? null,
      amountPence: reservation.amountPence,
      status: 'reserved',
      expiresAt,
    })
  }

  return c.json(
    {
      id,
      currency: 'GBP',
      lineItems,
      subtotalPence,
      vatPence,
      grossTotalPence: totalPence,
      discountPence,
      discount,
      discountError,
      totalPence: payablePence,
      status: 'active',
      expiresAt: expiresAt.toISOString(),
    },
    201,
  )
})

type DiscountOutcome =
  | { ok: true; code: string; promotionId: string; amountPence: number }
  | { ok: false; reason: string }

/**
 * Validate a discount code against the authoritative commerce promotion, enforce
 * the contribution floor, and confirm it isn't expired/exhausted/first-order-only.
 * Returns a safe failure reason instead of throwing.
 */
async function evaluateDiscount(args: {
  code: string
  grossTotal: number
  customerId: string | null
}): Promise<DiscountOutcome> {
  const [promo] = await db
    .select()
    .from(schema.promotions)
    .where(eq(schema.promotions.code, args.code))
    .limit(1)

  if (!promo) return { ok: false, reason: 'not_found' }
  if (!promo.active) return { ok: false, reason: 'inactive' }
  const now = Date.now()
  if (promo.startsAt && promo.startsAt.getTime() > now) return { ok: false, reason: 'not_started' }
  if (promo.expiresAt && promo.expiresAt.getTime() < now) return { ok: false, reason: 'expired' }

  // Exhaustion: count live reservations + redemptions against the cap.
  if (promo.maxRedemptions != null) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.promotionRedemptions)
      .where(
        sql`${schema.promotionRedemptions.promotionId} = ${promo.id}
            AND ${schema.promotionRedemptions.status} IN ('reserved','redeemed')
            AND (${schema.promotionRedemptions.expiresAt} IS NULL OR ${schema.promotionRedemptions.expiresAt} > now())`,
      )
    if (n >= promo.maxRedemptions) return { ok: false, reason: 'exhausted' }
  }

  // First-order-only: requires a known customer with zero prior orders.
  if (promo.firstOrderOnly) {
    if (!args.customerId) return { ok: false, reason: 'first_order_only' }
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(eq(schema.orders.customerId, args.customerId))
    if (n > 0) return { ok: false, reason: 'not_first_order' }
  }

  const raw =
    promo.kind === 'percentage'
      ? Math.round((args.grossTotal * promo.value) / 100)
      : promo.value
  const amountPence = Math.max(0, Math.min(raw, args.grossTotal))

  // Contribution floor: payable total must not drop below the configured share.
  const floor = Math.round((args.grossTotal * CONTRIBUTION_FLOOR_BPS) / 10000)
  if (args.grossTotal - amountPence < floor) {
    return { ok: false, reason: 'margin_floor' }
  }

  return { ok: true, code: promo.code, promotionId: promo.id, amountPence }
}

/** Fetch a quote; lazily marks it expired once past its TTL. */
app.get('/commerce/quotes/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select()
    .from(schema.pricingQuotes)
    .where(eq(schema.pricingQuotes.id, id))
    .limit(1)
  if (!row) return c.json({ error: 'not_found' }, 404)

  let status = row.status
  if (status === 'active' && row.expiresAt.getTime() < Date.now()) {
    status = 'expired'
    await db
      .update(schema.pricingQuotes)
      .set({ status })
      .where(eq(schema.pricingQuotes.id, id))
  }

  return c.json({
    id: row.id,
    currency: row.currency,
    lineItems: row.lineItems,
    subtotalPence: row.subtotalPence,
    vatPence: row.vatPence,
    totalPence: row.totalPence,
    status,
    expiresAt: row.expiresAt.toISOString(),
  })
})

/**
 * Private catalogue sync (Payload → iii.dev). Signed with a shared secret over
 * the raw body; commits approved product/variant pricing into catalog_skus.
 * Idempotent (upsert on product_slug+variant_label) and reconciling (variants
 * removed in Payload are deactivated in commerce). iii.dev never reads payload_db.
 */
app.post('/internal/catalog/sync', async (c) => {
  const secret = process.env.PAYLOAD_COMMERCE_SYNC_SECRET
  const expectedAudience = process.env.III_SYNC_AUDIENCE
  if (!secret || !expectedAudience) {
    return c.json({ error: 'sync_not_configured' }, 500)
  }

  const raw = await c.req.text()
  const signature = c.req.header(SYNC_SIGNATURE_HEADER) ?? ''
  if (!verifyBody(secret, raw, signature)) {
    return c.json({ error: 'invalid_signature' }, 401)
  }

  const parsed = CatalogSyncRequest.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 422)
  }
  const body = parsed.data
  if (body.audience !== expectedAudience) {
    return c.json({ error: 'wrong_audience' }, 403)
  }

  const bySlug = new Map<string, string[]>()
  for (const s of body.skus) {
    const list = bySlug.get(s.productSlug) ?? []
    list.push(s.variantLabel)
    bySlug.set(s.productSlug, list)
  }

  const client = await pool.connect()
  let upserted = 0
  let deactivated = 0
  try {
    await client.query('BEGIN')
    for (const s of body.skus) {
      await client.query(
        `INSERT INTO commerce.catalog_skus
           (id, product_slug, variant_label, supplier_sku, price_pence, vat_rate_bps, active, catalog_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (product_slug, variant_label) DO UPDATE SET
           supplier_sku = EXCLUDED.supplier_sku,
           price_pence = EXCLUDED.price_pence,
           vat_rate_bps = EXCLUDED.vat_rate_bps,
           active = EXCLUDED.active,
           catalog_version = EXCLUDED.catalog_version,
           updated_at = now()`,
        [
          newId('sku'),
          s.productSlug,
          s.variantLabel,
          s.supplierSku ?? null,
          s.pricePence,
          s.vatRateBps,
          s.active,
          body.catalogVersion,
        ],
      )
      upserted++
    }
    // Reconcile: deactivate variants no longer present for each synced product.
    for (const [slug, labels] of bySlug) {
      const res = await client.query(
        `UPDATE commerce.catalog_skus
           SET active = false, updated_at = now()
         WHERE product_slug = $1 AND variant_label <> ALL($2::text[]) AND active = true`,
        [slug, labels],
      )
      deactivated += res.rowCount ?? 0
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    return c.json({ error: 'sync_failed', message: (err as Error).message }, 500)
  } finally {
    client.release()
  }

  return c.json({
    ok: true,
    received: body.skus.length,
    upserted,
    deactivated,
    productSlugs: [...bySlug.keys()],
  })
})

function toSkuView(row: typeof schema.catalogSkus.$inferSelect) {
  const rate = row.vatRateBps / 10000
  return {
    id: row.id,
    productSlug: row.productSlug,
    variantLabel: row.variantLabel,
    grossPence: row.pricePence,
    vatPence: vatFromGross(row.pricePence, rate),
    netPence: row.pricePence - vatFromGross(row.pricePence, rate),
    vatRateBps: row.vatRateBps,
    catalogVersion: row.catalogVersion,
  }
}

const port = Number(process.env.PORT ?? 8080)
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`iii.dev api listening on http://localhost:${info.port} (region=${region})`)
})

// Graceful shutdown (spec: API/worker processes must implement graceful shutdown).
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`)
  server.close()
  await pool.end().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
