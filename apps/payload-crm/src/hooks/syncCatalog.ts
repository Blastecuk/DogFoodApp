import { createHmac } from 'crypto'
import type { CollectionAfterChangeHook } from 'payload'

/**
 * After a Product is published, push its accepted variant pricing to iii.dev's
 * private, signed catalogue-sync endpoint. iii.dev commits it to commerce
 * `catalog_skus` (the checkout source of truth). Payload never writes commerce
 * tables directly; iii.dev never reads payload_db.
 *
 * The request is HMAC-signed (sha256 hex over the exact raw body) with the shared
 * PAYLOAD_COMMERCE_SYNC_SECRET, matching @dogfood/contracts/signing on the receiver.
 *
 * P2 slice: direct push on publish. Durable delivery via the transactional outbox
 * is a later phase; failures here are logged, not fatal to the publish.
 */
type Variant = {
  variantLabel?: string | null
  supplierSku?: string | null
  retailPricePence?: number | null
  active?: boolean | null
}

export const syncCatalogAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (doc?._status !== 'published') return doc

  const apiBase = process.env.III_API_BASE_URL
  const secret = process.env.PAYLOAD_COMMERCE_SYNC_SECRET
  const audience = process.env.PAYLOAD_COMMERCE_SYNC_AUDIENCE
  if (!apiBase || !secret || !audience) {
    req.payload.logger.warn('Catalogue sync skipped: III_API_BASE_URL / sync secret / audience not set')
    return doc
  }

  const variants: Variant[] = Array.isArray(doc.variants) ? doc.variants : []
  const skus = variants
    .filter((v) => v.variantLabel && typeof v.retailPricePence === 'number')
    .map((v) => ({
      productSlug: doc.slug as string,
      variantLabel: v.variantLabel as string,
      supplierSku: v.supplierSku ?? null,
      pricePence: v.retailPricePence as number,
      vatRateBps: 2000,
      active: v.active ?? true,
    }))

  if (skus.length === 0) return doc

  const body = { source: 'payload', audience, catalogVersion: 1, skus }
  const raw = JSON.stringify(body)
  const signature = createHmac('sha256', secret).update(raw, 'utf8').digest('hex')

  try {
    const res = await fetch(`${apiBase}/internal/catalog/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-iii-sync-signature': signature },
      body: raw,
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      req.payload.logger.error(`Catalogue sync failed (${res.status}): ${JSON.stringify(result)}`)
    } else {
      req.payload.logger.info(`Catalogue sync ok for '${doc.slug}': ${JSON.stringify(result)}`)
    }
  } catch (err) {
    req.payload.logger.error(`Catalogue sync request error: ${(err as Error).message}`)
  }

  return doc
}
