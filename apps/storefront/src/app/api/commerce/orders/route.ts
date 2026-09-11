import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const III = process.env.III_API_BASE_URL ?? 'http://localhost:8080'

/** Session-gated order list. customerId comes from the session, not the browser. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const res = await fetch(`${III}/commerce/orders?customerId=${encodeURIComponent(session.user.id)}`, {
      cache: 'no-store',
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 })
  }
}
