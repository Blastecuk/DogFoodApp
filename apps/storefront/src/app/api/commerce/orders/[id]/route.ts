import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const III = process.env.III_API_BASE_URL ?? 'http://localhost:8080'

/** Session-gated order detail. iii.dev enforces ownership against customerId. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  try {
    const res = await fetch(
      `${III}/commerce/orders/${encodeURIComponent(id)}?customerId=${encodeURIComponent(session.user.id)}`,
      { cache: 'no-store' },
    )
    return NextResponse.json(await res.json(), { status: res.status })
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 })
  }
}
