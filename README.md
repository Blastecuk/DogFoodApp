# DogFood Ecommerce/CRM Platform

Monorepo for the Dog Food ecommerce/CRM platform, built to the approved
specifications:

- `dog-food-ecommerce-architecture-spec.md` (v2.6) — source of truth
- `payload-supplier-pricing-discounts-role-spec.md` (v1.2)
- `vercel-domain-deployment-spec.md` (v1.2)
- `dog-food-ecommerce-prototype-handoff.md` (v1.4)

> **Status: P0 foundation.** This branch establishes the repository, monorepo
> layout, shared contracts and a runnable Payload CRM + storefront. The commerce
> engine (iii.dev workers, Stripe, RabbitMQ, outbox, manufacturer/tracking) is
> scaffolded as structure only and implemented in later phases (P1–P7).

## Architecture at a glance

| Concern | Owner | Where |
|---|---|---|
| Published content, media, SEO, supplier/promotion **proposals** | Payload | `apps/payload-crm` → `crm.` (Vercel) |
| Storefront, customer accounts, checkout UI | Next.js + Better Auth | `apps/storefront` → `www.` (Vercel) |
| Commerce rules, orders, payments, fulfilment | iii.dev | `workers/*` → `api.` (Fly.io) |
| Databases (isolated) | Neon | `payload_db` + `commerce_db` |

Customer auth (Better Auth) and staff auth (Payload) never share cookies.
Payload can access only `payload_db`; commerce code only `commerce_db`.

## Layout

```
apps/
  storefront/            Next.js storefront + Better Auth (customer)  [Vercel A]
  payload-crm/           Next.js + Payload CMS/CRM (staff)            [Vercel B]
workers/                 iii.dev HTTP API + durable consumers         [Fly.io lhr]
  api/ order-orchestrator/ subscriptions/ manufacturer/ tracking/ email/ reconciliation/
packages/
  contracts/             Zod contracts, IDs, money/VAT, event envelopes
  commerce-db/           Drizzle schema + migrations (commerce_db)
  auth/                  Better Auth server configuration
  pricing/ manufacturer-adapter/ tracking-adapter/ email-templates/ observability/
```

## Getting started

```bash
pnpm install

# Payload CRM (staff) — http://localhost:3000/admin
#   Requires apps/payload-crm/.env with DATABASE_URL (payload_db) + PAYLOAD_SECRET
pnpm --filter payload-crm payload migrate
pnpm dev:crm

# Storefront (customer) — http://localhost:3001
#   Requires COMMERCE_DATABASE_URL + BETTER_AUTH_SECRET (see .env.example)
pnpm --filter @dogfood/auth auth:migrate
pnpm dev:storefront
```

Databases use one Neon project (`DogFoodApp`) with `payload_db` and `commerce_db`.
Develop against a **Neon branch**, never the production branch. See `.env.example`.

## Non-negotiables (see specs)

- iii.dev owns all commerce state; Next.js/Payload call APIs, never write commerce tables.
- Only `SuperAdmin` may approve/activate supplier costs and promotions.
- Never trust browser prices; revalidate against `catalog_skus` at checkout.
- Provider webhooks hit Fly.io directly; browsers use same-origin BFF routes.
