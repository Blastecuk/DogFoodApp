'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Order = {
  id: string
  fulfilmentStatus: string
  paymentStatus: string
  totalPence: number
}

const gbp = (p: number) => `£${(p / 100).toFixed(2)}`

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/commerce/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .finally(() => setLoaded(true))
  }, [])

  if (loaded && orders.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No orders yet.</p>
  }

  return (
    <ul className="mt-6 space-y-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={`/account/orders/${o.id}`}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300"
          >
            <div>
              <p className="font-mono text-sm">{o.id}</p>
              <p className="text-sm text-slate-500">
                {o.paymentStatus} · fulfilment: {o.fulfilmentStatus}
              </p>
            </div>
            <span className="font-semibold">{gbp(o.totalPence)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
