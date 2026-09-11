import { redirect } from 'next/navigation'
import { OrdersClient } from '@/components/orders-client'
import { getSession } from '@/lib/session'

export default async function OrdersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold">Your orders</h1>
      <OrdersClient />
    </main>
  )
}
