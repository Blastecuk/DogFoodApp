import 'dotenv/config'
import { Client } from 'pg'

/**
 * Idempotent, environment-guarded seed for the commerce read model.
 * Seeds the spec's launch SKUs (2kg £12.00, 6kg £18.00, 12kg £40.00 inc VAT).
 * Runs as commerce_runtime to prove the runtime role has CRUD on commerce.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production.')
  process.exit(1)
}

const runtimeUrl = process.env.COMMERCE_DATABASE_URL
if (!runtimeUrl) throw new Error('COMMERCE_DATABASE_URL is required')

// price_pence is the gross (inc-VAT) retail price; vat_rate_bps = 2000 (20%).
const skus = [
  { id: 'sku_kibble_2kg', slug: 'chicken-rice-kibble', variant: '2kg', supplierSku: 'ACME-CR-2', price: 1200 },
  { id: 'sku_kibble_6kg', slug: 'chicken-rice-kibble', variant: '6kg', supplierSku: 'ACME-CR-6', price: 1800 },
  { id: 'sku_kibble_12kg', slug: 'chicken-rice-kibble', variant: '12kg', supplierSku: 'ACME-CR-12', price: 4000 },
]

async function main() {
  const client = new Client({ connectionString: runtimeUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    for (const s of skus) {
      await client.query(
        `INSERT INTO commerce.catalog_skus
           (id, product_slug, variant_label, supplier_sku, price_pence, vat_rate_bps, active, catalog_version)
         VALUES ($1, $2, $3, $4, $5, 2000, true, 1)
         ON CONFLICT (product_slug, variant_label)
         DO UPDATE SET price_pence = EXCLUDED.price_pence,
                       supplier_sku = EXCLUDED.supplier_sku,
                       active = true,
                       updated_at = now()`,
        [s.id, s.slug, s.variant, s.supplierSku, s.price],
      )
    }
    const { rows } = await client.query('SELECT count(*)::int AS n FROM commerce.catalog_skus')
    console.log(`Seed complete. catalog_skus rows: ${rows[0].n}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
