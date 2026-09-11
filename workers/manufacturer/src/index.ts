import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { pool } from '@dogfood/commerce-db'
import {
  FakeManufacturerAdapter,
  type ManufacturerAdapter,
} from '@dogfood/manufacturer-adapter'

/**
 * Manufacturer consumer (Fly.io `worker` process group).
 *
 * Consumes paid orders and submits a works order to the manufacturer with a
 * stable idempotency key (the order id) so a resubmit never duplicates. Handles:
 *   - accepted            -> record ref, fulfilment 'submitted'
 *   - retryable_error     -> retry (bounded)
 *   - ambiguous timeout   -> look up whether the works order already landed
 *   - rejected            -> fulfilment 'rejected' (operational case = P5 TODO)
 *
 * In production this consumes the `order.paid` event from RabbitMQ with a
 * consumer inbox; here it polls committed paid orders (the same source of truth).
 */
const MAX_ATTEMPTS = 3

export type ProcessResult = {
  orderId: string
  result: string
  manufacturerRef?: string
  reason?: string
  attempts?: number
}

export async function processOrder(
  orderId: string,
  adapter: ManufacturerAdapter,
): Promise<ProcessResult> {
  const client = await pool.connect()
  try {
    const { rows: orderRows } = await client.query(
      `SELECT id, fulfilment_status FROM commerce.orders WHERE id=$1`,
      [orderId],
    )
    if (orderRows.length === 0) return { orderId, result: 'order_not_found' }

    const { rows: woRows } = await client.query(
      `SELECT * FROM commerce.manufacturer_works_orders WHERE order_id=$1`,
      [orderId],
    )
    let wo = woRows[0]
    if (wo && wo.status === 'accepted') {
      return { orderId, result: 'already_accepted', manufacturerRef: wo.manufacturer_ref }
    }
    if (!wo) {
      await client.query(
        `INSERT INTO commerce.manufacturer_works_orders (id, order_id, idempotency_key, status, attempts)
         VALUES ($1,$2,$3,'pending',0)`,
        [`wo_${randomUUID().replace(/-/g, '')}`, orderId, orderId],
      )
      wo = { attempts: 0 }
    }

    const { rows: items } = await client.query(
      `SELECT sku_id, quantity FROM commerce.order_items WHERE order_id=$1`,
      [orderId],
    )
    const input = {
      idempotencyKey: orderId,
      orderId,
      items: items.map((i) => ({ sku: i.sku_id, quantity: i.quantity })),
    }

    const accept = async (ref: string, attempts: number) => {
      await client.query(
        `UPDATE commerce.manufacturer_works_orders
           SET status='accepted', manufacturer_ref=$2, attempts=$3, last_error=NULL, updated_at=now()
         WHERE order_id=$1`,
        [orderId, ref, attempts],
      )
      await client.query(
        `UPDATE commerce.orders SET fulfilment_status='submitted' WHERE id=$1`,
        [orderId],
      )
    }
    const reject = async (reason: string, attempts: number) => {
      await client.query(
        `UPDATE commerce.manufacturer_works_orders
           SET status='rejected', last_error=$2, attempts=$3, updated_at=now()
         WHERE order_id=$1`,
        [orderId, reason, attempts],
      )
      await client.query(
        `UPDATE commerce.orders SET fulfilment_status='rejected' WHERE id=$1`,
        [orderId],
      )
    }

    let attempts = wo.attempts ?? 0
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts++
      const res = await adapter.submitWorksOrder(input)
      if (res.outcome === 'accepted') {
        await accept(res.manufacturerRef, attempts)
        return { orderId, result: 'accepted', manufacturerRef: res.manufacturerRef, attempts }
      }
      if (res.outcome === 'rejected') {
        await reject(res.reason, attempts)
        return { orderId, result: 'rejected', reason: res.reason, attempts }
      }
      if (res.outcome === 'timeout') {
        const look = await adapter.lookupWorksOrder(orderId)
        if (look.found) {
          await accept(look.manufacturerRef, attempts)
          return {
            orderId,
            result: 'accepted_after_timeout_lookup',
            manufacturerRef: look.manufacturerRef,
            attempts,
          }
        }
      }
      await client.query(
        `UPDATE commerce.manufacturer_works_orders SET attempts=$2, last_error=$3, updated_at=now() WHERE order_id=$1`,
        [orderId, attempts, res.outcome],
      )
    }
    return { orderId, result: 'exhausted_retries', attempts }
  } finally {
    client.release()
  }
}

/** Find paid orders that still need a works order and submit them. */
export async function processPendingOrders(adapter: ManufacturerAdapter): Promise<number> {
  const { rows } = await pool.query(
    `SELECT o.id FROM commerce.orders o
       LEFT JOIN commerce.manufacturer_works_orders w ON w.order_id = o.id
      WHERE o.payment_status='paid'
        AND o.fulfilment_status='pending'
        AND (w.id IS NULL OR w.status='pending')`,
  )
  for (const r of rows) {
    const res = await processOrder(r.id, adapter)
    console.log(`[manufacturer] ${r.id} -> ${res.result}${res.manufacturerRef ? ` (${res.manufacturerRef})` : ''}`)
  }
  return rows.length
}

async function main() {
  const adapter = new FakeManufacturerAdapter('accept_immediately')
  const once = process.argv.includes('--once')
  if (once) {
    const n = await processPendingOrders(adapter)
    console.log(`[manufacturer] drain complete, processed ${n} order(s)`)
    await pool.end()
    return
  }
  console.log('[manufacturer] worker started (fake adapter, accept_immediately); polling every 3s')
  let running = true
  const stop = (s: string) => {
    console.log(`[manufacturer] ${s} received, stopping...`)
    running = false
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
  while (running) {
    const n = await processPendingOrders(adapter)
    if (n === 0) await new Promise((r) => setTimeout(r, 3000))
  }
  await pool.end()
  process.exit(0)
}

// Only run the loop when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  main().catch((err) => {
    console.error('[manufacturer] fatal:', err)
    process.exit(1)
  })
}
