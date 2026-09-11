import 'dotenv/config'
import { serve } from '@hono/node-server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, pool, schema } from '@dogfood/commerce-db'
import { vatFromGross } from '@dogfood/contracts'

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

app.get('/health', async (c) => {
  try {
    await pool.query('SELECT 1')
    return c.json({ status: 'ok', db: 'up', region, ts: new Date().toISOString() })
  } catch {
    return c.json({ status: 'degraded', db: 'down', region, ts: new Date().toISOString() }, 503)
  }
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
