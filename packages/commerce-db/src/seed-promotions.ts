import 'dotenv/config'
import { Client } from 'pg'

/**
 * Idempotent seed of the spec's discount fixtures (prototype handoff §6):
 * one safe active first-order code, one expired, one exhausted, one margin-breaking.
 * Runs as commerce_runtime.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production.')
  process.exit(1)
}
const url = process.env.COMMERCE_DATABASE_URL
if (!url) throw new Error('COMMERCE_DATABASE_URL is required')

// [id, code, kind, value, firstOrderOnly, active, maxRedemptions, expiresAt]
const promos: [string, string, string, number, boolean, boolean, number | null, string | null][] = [
  ['promo_welcome5', 'WELCOME5', 'fixed', 500, true, true, 1, null], // safe, first-order, works once
  ['promo_expired10', 'EXPIRED10', 'fixed', 1000, false, true, null, '2020-01-01T00:00:00Z'], // expired
  ['promo_usedup', 'USEDUP', 'fixed', 500, false, true, 0, null], // exhausted (0 redemptions allowed)
  ['promo_bigmoney', 'BIGMONEY', 'fixed', 10000, false, true, null, null], // margin-breaking (£100 off)
]

async function main() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    for (const [id, code, kind, value, firstOrderOnly, active, maxRedemptions, expiresAt] of promos) {
      await client.query(
        `INSERT INTO commerce.promotions
           (id, code, kind, value, first_order_only, active, max_redemptions, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (code) DO UPDATE SET
           kind = EXCLUDED.kind, value = EXCLUDED.value,
           first_order_only = EXCLUDED.first_order_only, active = EXCLUDED.active,
           max_redemptions = EXCLUDED.max_redemptions, expires_at = EXCLUDED.expires_at`,
        [id, code, kind, value, firstOrderOnly, active, maxRedemptions, expiresAt],
      )
    }
    const { rows } = await client.query('SELECT count(*)::int AS n FROM commerce.promotions')
    console.log(`Promotions seeded. rows: ${rows[0].n}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Promotions seed failed:', err)
  process.exit(1)
})
