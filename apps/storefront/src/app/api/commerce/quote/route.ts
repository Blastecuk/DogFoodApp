import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

/**
 * Same-origin BFF for server-priced checkout quotes.
 *
 * - Validates the host-only Better Auth session here.
 * - Forwards ONLY sku + quantity to iii.dev; the customer id comes from the
 *   session, never the browser, and the Better Auth cookie is NOT sent to Fly.
 * - Prices are never taken from the browser — iii.dev prices from catalog_skus.
 *
 * (A short-lived, audience-restricted BFF token to iii.dev is a later hardening
 * step; today the storefront server calls iii.dev directly server-to-server.)
 */
const III = process.env.III_API_BASE_URL ?? 'http://localhost:8080'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const items = Array.isArray(body?.items)
    ? body.items
        .map((i: { skuId?: unknown; quantity?: unknown }) => ({
          skuId: String(i.skuId ?? ''),
          quantity: Math.max(1, Math.min(999, Math.floor(Number(i.quantity ?? 0)))),
        }))
        .filter((i: { skuId: string; quantity: number }) => i.skuId && i.quantity > 0)
    : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'empty_cart' }, { status: 400 })
  }

  try {
    const res = await fetch(`${III}/commerce/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // customerId is derived from the session, not accepted from the client.
      body: JSON.stringify({ items, customerId: session.user.id }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 })
  }
}
