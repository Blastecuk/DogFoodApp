import 'dotenv/config'
import { serve } from '@hono/node-server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, pool, schema } from '@dogfood/commerce-db'
import { CatalogSyncRequest, newId, vatFromGross } from '@dogfood/contracts'
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
