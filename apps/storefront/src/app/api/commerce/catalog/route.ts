import { NextResponse } from 'next/server'

/**
 * Same-origin BFF proxy for the catalogue read model. The browser calls this
 * (www origin), and the server calls iii.dev — the browser never talks to Fly
 * directly and never sees commerce credentials.
 */
const III = process.env.III_API_BASE_URL ?? 'http://localhost:8080'

export async function GET() {
  try {
    const res = await fetch(`${III}/commerce/catalog`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 })
  }
}
