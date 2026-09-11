import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

/**
 * Better Auth is the ONLY customer-authentication authority (architecture spec
 * non-negotiable #9). Its tables live in commerce_db. Payload staff auth is
 * entirely separate and never shares cookies with this.
 */
const connectionString =
  process.env.COMMERCE_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

export const auth = betterAuth({
  database: new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  }),
  emailAndPassword: {
    enabled: true,
    // Prototype: no customer email server wired yet, so accounts are immediate.
    requireEmailVerification: false,
  },
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-insecure-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
})

export type Auth = typeof auth
