import { redirect } from 'next/navigation'
import { CartClient } from '@/components/cart-client'
import { getSession } from '@/lib/session'

export default async function CartPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold">Build your order</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick quantities and get a server-priced quote. Prices come from the
        commerce catalogue via iii.dev — never from your browser.
      </p>
      <CartClient />
    </main>
  )
}
