import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'
import { getSession } from '@/lib/session'

export default async function AccountPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your account</h1>
        <SignOutButton />
      </header>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="text-lg font-semibold">{session.user.email}</p>
        <p className="mt-4 text-sm text-slate-500">
          Orders, subscriptions and tracking will appear here, served through
          same-origin BFF routes to the iii.dev commerce API (never by trusting
          the browser).
        </p>
        <a
          href="/cart"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Build an order →
        </a>
      </div>
    </main>
  )
}
