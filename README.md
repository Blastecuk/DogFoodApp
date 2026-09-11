# DogFoodApp 🐶🦴

A small full-stack app to track your dog's food stash — brands, flavors, and how
many bags you have in stock. Built to exercise a modern, fully self-contained
development environment.

## Stack

- **[Next.js 16](https://nextjs.org/blog/next-16-1)** (App Router, Turbopack, Server Actions)
- **[Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)**
- **[Drizzle ORM](https://orm.drizzle.team/docs/connect-overview)** for the data layer
- **[Better Auth](https://www.better-auth.com/blog/1-4)** for email/password authentication
- **[PGlite](https://pglite.dev/)** — an embedded WebAssembly Postgres, so the app
  needs **no external database or system packages** to run.

## Getting started

```bash
pnpm install
pnpm db:generate   # generate SQL migrations from the Drizzle schema (already committed)
pnpm db:migrate    # apply migrations to the local PGlite database (./.pgdata)
pnpm dev           # start the dev server at http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000), create an account, and
start logging dog food.

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Run the Next.js dev server (Turbopack). |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build. |
| `pnpm lint` | Run ESLint. |
| `pnpm db:generate` | Generate SQL migrations from `src/db/schema.ts`. |
| `pnpm db:migrate` | Apply migrations to the PGlite database. |

## Environment variables

See [`.env.example`](./.env.example). The app runs with safe defaults out of the
box (an embedded database and a dev-only auth secret), so no configuration is
required for local development. Set `BETTER_AUTH_SECRET` to a strong value for
any real deployment.

## Data layer

Because PGlite is a real Postgres compiled to WebAssembly, the schema and
migrations are ordinary Postgres. The database lives in the `./.pgdata`
directory (git-ignored). Delete it to reset all data.

## Cloud Agent environment

This repo ships a [`.cursor/environment.json`](./.cursor/environment.json) that:

- runs `pnpm install` and applies database migrations during `install`, and
- starts the dev server as a persistent terminal.

No secrets or external services are required.
