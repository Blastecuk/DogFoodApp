import config from '@payload-config'
import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { OperationsClient } from './OperationsClient'

/**
 * Payload CRM operations screen. Staff-gated (Payload session); reads the SAME
 * committed order/tracking/case state the customer sees, over the protected
 * iii.dev /ops API via the same-origin BFF. It never duplicates order documents.
 */
export default async function OperationsPage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
    redirect('/admin/login')
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Operations</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>
        Signed in as {user.email} ({user.role}). Live order, manufacturer and tracking
        state served by iii.dev — Neon remains authoritative.
      </p>
      <OperationsClient />
    </div>
  )
}
