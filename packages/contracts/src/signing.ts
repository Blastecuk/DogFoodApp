import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * HMAC signing for internal service-to-service requests (e.g. Payload → iii.dev
 * catalogue sync). Signs the raw request body with a shared secret; hex(sha256).
 * Server-only (imported via the `@dogfood/contracts/signing` subpath so the
 * Node crypto dependency never reaches a browser bundle).
 */
export function signBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

export function verifyBody(secret: string, rawBody: string, signature: string): boolean {
  if (!signature) return false
  const expected = signBody(secret, rawBody)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const SYNC_SIGNATURE_HEADER = 'x-iii-sync-signature'
