'use client'

import { useEffect, useState } from 'react'

type Order = { id: string; customerId: string; paymentStatus: string; fulfilmentStatus: string; totalPence: number }
type TrackingEvent = { status: string; occurredAt: string }
type Shipment = { carrierCode: string; trackingNumber: string; status: string; events: TrackingEvent[] }
type Case = { id: string; kind: string; detail: string; status: string; createdAt: string }
type Detail = {
  id: string
  customerId: string
  fulfilmentStatus: string
  paymentStatus: string
  totalPence: number
  items: { description: string; quantity: number; unitPricePence: number }[]
  worksOrder: { status: string; manufacturerRef: string | null; attempts: number } | null
  shipments: Shipment[]
  cases: Case[]
}

const gbp = (p: number) => `£${(p / 100).toFixed(2)}`
const box: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff' }

export function OperationsClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const loadOrders = () =>
    fetch('/api/ops/orders').then((r) => r.json()).then((d) => setOrders(d.orders ?? []))
  const loadDetail = (id: string) =>
    fetch(`/api/ops/orders/${id}`).then((r) => r.json()).then(setDetail)

  useEffect(() => {
    loadOrders()
  }, [])

  async function open(id: string) {
    setSelected(id)
    setMsg(null)
    setNote('')
    await loadDetail(id)
  }

  async function addNote() {
    if (!selected || !note.trim()) return
    const res = await fetch(`/api/ops/orders/${selected}/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ detail: note.trim() }),
    })
    if (res.ok) {
      setMsg('Case recorded')
      setNote('')
      await loadDetail(selected)
    } else {
      setMsg('Failed to record case')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginTop: 24 }}>
      <div style={box}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Orders</h2>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
          {orders.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => open(o.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 0', border: 'none',
                  borderBottom: '1px solid #f1f5f9', background: 'none', cursor: 'pointer',
                  fontWeight: selected === o.id ? 700 : 400,
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id.slice(0, 22)}…</span>
                <br />
                <span style={{ fontSize: 12, color: '#64748b' }}>{o.fulfilmentStatus} · {gbp(o.totalPence)}</span>
              </button>
            </li>
          ))}
          {orders.length === 0 && <li style={{ color: '#64748b', fontSize: 14 }}>No orders.</li>}
        </ul>
      </div>

      <div style={box}>
        {!detail ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Select an order.</p>
        ) : (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace' }}>{detail.id}</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              customer {detail.customerId} · {detail.paymentStatus} · fulfilment <b>{detail.fulfilmentStatus}</b> · {gbp(detail.totalPence)}
            </p>
            <p style={{ fontSize: 13, marginTop: 8 }}>
              <b>Manufacturer:</b>{' '}
              {detail.worksOrder ? `${detail.worksOrder.status} ${detail.worksOrder.manufacturerRef ?? ''} (attempts ${detail.worksOrder.attempts})` : '—'}
            </p>

            <p style={{ fontSize: 13, marginTop: 8 }}><b>Tracking</b></p>
            {detail.shipments.length === 0 ? (
              <p style={{ fontSize: 13, color: '#64748b' }}>No shipments.</p>
            ) : (
              detail.shipments.map((s, i) => (
                <div key={i} style={{ fontSize: 13, marginTop: 4 }}>
                  {s.carrierCode} · {s.trackingNumber} — <b>{s.status.replace(/_/g, ' ')}</b>
                  <span style={{ color: '#94a3b8' }}> ({s.events.map((e) => e.status).join(' → ')})</span>
                </div>
              ))
            )}

            <p style={{ fontSize: 13, marginTop: 12 }}><b>Cases</b></p>
            <ul style={{ fontSize: 13, paddingLeft: 16 }}>
              {detail.cases.map((c) => (
                <li key={c.id}>[{c.kind}] {c.detail} <span style={{ color: '#94a3b8' }}>({c.status})</span></li>
              ))}
              {detail.cases.length === 0 && <li style={{ color: '#64748b' }}>None.</li>}
            </ul>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Record an operational note…"
                style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13 }}
              />
              <button
                onClick={addNote}
                style={{ padding: '6px 14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
              >
                Add case
              </button>
            </div>
            {msg && <p style={{ fontSize: 12, color: '#059669', marginTop: 6 }}>{msg}</p>}
          </>
        )}
      </div>
    </div>
  )
}
