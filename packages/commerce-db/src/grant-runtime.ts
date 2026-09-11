import 'dotenv/config'
import { Client } from 'pg'

/**
 * Grants the least-privilege runtime role (commerce_runtime) CRUD access to the
 * commerce schema. Run as the migrator role, which owns the migrated objects,
 * after `pnpm --filter @dogfood/commerce-db migrate`.
 *
 * This encodes the spec's role separation: the migrator owns/creates schema,
 * the runtime role only reads/writes rows. Idempotent.
 */
const migratorUrl = process.env.COMMERCE_MIGRATION_DATABASE_URL
if (!migratorUrl) throw new Error('COMMERCE_MIGRATION_DATABASE_URL is required')

const statements = [
  'GRANT USAGE ON SCHEMA commerce TO commerce_runtime',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA commerce TO commerce_runtime',
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA commerce TO commerce_runtime',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA commerce GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO commerce_runtime',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA commerce GRANT USAGE, SELECT ON SEQUENCES TO commerce_runtime',
  // Allow the project owner read access so tooling/verification can inspect.
  'GRANT USAGE ON SCHEMA commerce TO neondb_owner',
  'GRANT SELECT ON ALL TABLES IN SCHEMA commerce TO neondb_owner',
]

async function main() {
  const client = new Client({
    connectionString: migratorUrl,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
    }
    console.log('commerce_runtime grants applied.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Grant failed:', err)
  process.exit(1)
})
