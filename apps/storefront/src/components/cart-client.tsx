'use client'

import { useEffect, useState } from 'react'

type Sku = {
  id: string
  productSlug: string
  variantLabel: string
  grossPence: number
}

type QuoteLine = {
  skuId: string
  productSlug: string
  variantLabel: string
  quantity: number
  unitGrossPence: number
  lineGrossPence: number
  lineVatPence: number
}

type Quote = {
  id: string
  currency: string
  lineItems: QuoteLine[]
  subtotalPence: number
  vatPence: number
  totalPence: number
  status: string
  expiresAt: string
}

const gbp = (pence: number) => `£${(pence / 100).toFixed(2)}`

export function CartClient() {
  const [skus, setSkus] = useState<Sku[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/commerce/catalog')
      .then((r) => r.json())
      .then((d) => setSkus(d.skus ?? []))
      .catch(() => setError('Could not load catalogue'))
  }, [])

  async function getQuote() {
    setError(null)
    setQuote(null)
    setLoading(true)
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([skuId, quantity]) => ({ skuId, quantity }))
    if (items.length === 0) {
      setLoading(false)
      setError('Add at least one item')
      return
    }
    const res = await fetch('/api/commerce/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not price quote')
      return
    }
    setQuote(data)
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Catalogue</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {skus.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">
                  {s.productSlug} · {s.variantLabel}
                </p>
                <p className="text-sm text-slate-500">{gbp(s.grossPence)} each (inc VAT)</p>
              </div>
              <input
                type="number"
                min={0}
                max={999}
                value={qty[s.id] ?? 0}
                aria-label={`Quantity for ${s.productSlug} ${s.variantLabel}`}
                onChange={(e) =>
                  setQty((q) => ({ ...q, [s.id]: Math.max(0, Number(e.target.value)) }))
                }
                className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </li>
          ))}
          {skus.length === 0 && !error && (
            <li className="py-3 text-sm text-slate-500">Loading catalogue…</li>
          )}
        </ul>
        <button
          onClick={getQuote}
          disabled={loading}
          className="mt-4 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? 'Pricing…' : 'Get quote'}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
      </section>

      {quote && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Server-priced quote</h2>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {quote.status}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {quote.lineItems.map((l) => (
              <li key={l.skuId} className="flex justify-between py-2 text-sm">
                <span>
                  {l.quantity} × {l.productSlug} · {l.variantLabel}
                </span>
                <span>{gbp(l.lineGrossPence)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal (net)</dt>
              <dd>{gbp(quote.subtotalPence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">VAT</dt>
              <dd>{gbp(quote.vatPence)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd>{gbp(quote.totalPence)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            Quote {quote.id} · expires {new Date(quote.expiresAt).toLocaleTimeString()}
          </p>
        </section>
      )}
    </div>
  )
}
