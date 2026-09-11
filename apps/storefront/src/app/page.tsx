import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-5xl">🐶🦴</div>
      <h1 className="text-4xl font-bold tracking-tight">yourdogfood.co.uk</h1>
      <p className="mt-3 max-w-md text-slate-500">
        Premium dog food, delivered on your schedule. This is the storefront —
        customer identity is handled by Better Auth against the commerce
        database.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/create-account"
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold hover:bg-slate-100"
        >
          Log in
        </Link>
      </div>
      <p className="mt-10 text-xs text-slate-400">
        Storefront (Vercel project A) · CRM lives on crm. · APIs on api. → Fly.io
      </p>
    </main>
  )
}
