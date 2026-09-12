import { createHmac, randomUUID } from 'crypto'
import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

/**
 * Payload CRM backend-for-frontend for the protected iii.dev `/ops` API.
 *
 * - Validates the host-only Payload STAFF session here (never forwards the
 *   Payload cookie to Fly).
 * - Mints a short-lived, audience-restricted staff token (actor id, role, exp,
 *   correlation id) and calls iii.dev with it. iii.dev re-authorises the token.
 *
 * Prototype token = HMAC over base64url(claims); production uses asymmetric keys.
 */
const III = process.env.III_API_BASE_URL ?? 'http://localhost:8080'
const SECRET = process.env.III_STAFF_TOKEN_SECRET ?? 'unset-staff-secret'
const AUD = process.env.III_STAFF_TOKEN_AUDIENCE ?? 'iii-ops-api'

function mintStaffToken(sub: string, role: string): string {
  const claims = {
    iss: 'payload-crm',
    aud: AUD,
    sub,
    role,
    exp: Math.floor(Date.now() / 1000) + 120,
    correlationId: randomUUID(),
  }
  const part = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(part).digest('hex')
  return `${part}.${sig}`
}

async function authStaff() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) return null
  return user as { id: string; role: string }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await authStaff()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { path } = await params
  const token = mintStaffToken(user.id, user.role)
  const search = new URL(req.url).search
  const res = await fetch(`${III}/ops/${path.join('/')}${search}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  return NextResponse.json(await res.json(), { status: res.status })
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await authStaff()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { path } = await params
  const token = mintStaffToken(user.id, user.role)
  const body = await req.text()
  const res = await fetch(`${III}/ops/${path.join('/')}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body,
  })
  return NextResponse.json(await res.json(), { status: res.status })
}
