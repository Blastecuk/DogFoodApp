'use client'

import { useEffect, useState } from 'react'

type TrackingEvent = { status: string; occurredAt: string }
type Shipment = {
  id: string
  carrierCode: string
  trackingNumber: string
  status: string
  events: TrackingEvent[]
}
type OrderDetail = {
  id: string
  fulfilmentStatus: string
  paymentStatus: string
  totalPence: number
  items: { description: string; quantity: number; unitPricePence: number }[]
  shipments: Shipment[]
}

const gbp = (p: number) => `£${(p / 100).toFixed(2)}`
const label = (s: string) => s.replace(/_/g, ' ')

export function OrderDetailClient({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/commerce/orders/${id}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(await r.json())))
      .then(setOrder)
      .catch(() => setError('Order not found'))
  }, [id])

  if (error) return <p className="mt-6 text-sm text-red-600">{error}</p>
  if (!order) return <p className="mt-6 text-sm text-slate-500">Loading…</p>

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="font-mono text-sm">{order.id}</p>
        <p className="mt-1 text-sm text-slate-500">
          {order.paymentStatus} · fulfilment: <strong>{label(order.fulfilmentStatus)}</strong> · {gbp(order.totalPence)}
        </p>
        <ul className="mt-3 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between py-1">
              <span>
                {i.quantity} × {i.description}
              </span>
              <span>{gbp(i.unitPricePence * i.quantity)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Tracking</h2>
        {order.shipments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Not dispatched yet.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {order.shipments.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {s.carrierCode} · {s.trackingNumber}
                  </p>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                    {label(s.status)}
                  </span>
                </div>
                <ol className="mt-3 space-y-1 border-l-2 border-slate-100 pl-4 text-sm">
                  {s.events.map((e, i) => (
                    <li key={i} className="text-slate-600">
                      <span className="font-medium capitalize">{label(e.status)}</span>{' '}
                      <span className="text-slate-400">
                        · {new Date(e.occurredAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
