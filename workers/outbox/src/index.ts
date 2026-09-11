import 'dotenv/config'
import { pool } from '@dogfood/commerce-db'

/**
 * Outbox publisher (Fly.io `outbox` process group).
 *
 * Claims committed but unpublished outbox events with FOR UPDATE SKIP LOCKED,
 * publishes each through a transport, and only marks it published after the
 * transport confirms — the publisher-confirm rule. Consumers dedupe on the
 * event's idempotency key (their inbox).
 *
 * Prototype transport = structured log. Production transport = RabbitMQ (durable
 * quorum queue, publisher confirms); swap `publish` for the RabbitMQ adapter.
 */
type OutboxRow = {
  id: string
  event_type: string
  idempotency_key: string
  correlation_id: string
  payload: unknown
}

async function publish(event: OutboxRow): Promise<void> {
  // RabbitMQ adapter goes here in production (channel.publish + waitForConfirms).
  console.log(
    `[outbox] published ${event.event_type} id=${event.id} key=${event.idempotency_key} corr=${event.correlation_id} payload=${JSON.stringify(event.payload)}`,
  )
}

const BATCH = 20

/** Claim + publish one batch in a single transaction. Returns count published. */
async function drainOnce(): Promise<number> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<OutboxRow>(
      `SELECT id, event_type, idempotency_key, correlation_id, payload
         FROM commerce.outbox_events
        WHERE status = 'pending'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH}`,
    )
    for (const row of rows) {
      await publish(row) // only mark published after the transport confirms
      await client.query(
        `UPDATE commerce.outbox_events SET status='published', published_at=now() WHERE id=$1`,
        [row.id],
      )
    }
    await client.query('COMMIT')
    return rows.length
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[outbox] batch failed, will retry:', (err as Error).message)
    return 0
  } finally {
    client.release()
  }
}

async function main() {
  const once = process.argv.includes('--once')
  if (once) {
    let total = 0
    let n: number
    do {
      n = await drainOnce()
      total += n
    } while (n === BATCH)
    console.log(`[outbox] drain complete, published ${total} event(s)`)
    await pool.end()
    return
  }

  console.log('[outbox] publisher started (log transport); polling every 2s')
  let running = true
  const shutdown = async (sig: string) => {
    console.log(`[outbox] ${sig} received, stopping...`)
    running = false
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  while (running) {
    const n = await drainOnce()
    if (n === 0) await new Promise((r) => setTimeout(r, 2000))
  }
  await pool.end()
  process.exit(0)
}

main().catch((err) => {
  console.error('[outbox] fatal:', err)
  process.exit(1)
})
