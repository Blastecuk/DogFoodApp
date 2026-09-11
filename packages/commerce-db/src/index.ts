import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString =
  process.env.COMMERCE_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

const globalForDb = globalThis as unknown as { commercePool?: Pool }

export const pool =
  globalForDb.commercePool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.commercePool = pool
}

export const db = drizzle(pool, { schema })
export { schema }
