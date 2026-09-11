import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.COMMERCE_MIGRATION_DATABASE_URL ?? process.env.COMMERCE_DATABASE_URL ?? '',
  },
  // The commerce schema is isolated; never touch Payload's tables.
  schemaFilter: ['commerce'],
})
