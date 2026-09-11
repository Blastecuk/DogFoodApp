import Link from 'next/link'
import { redirect } from 'next/navigation'
import { OrderDetailClient } from '@/components/order-detail-client'
import { getSession } from '@/lib/session'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const { id } = await params
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link href="/account/orders" className="text-sm text-indigo-600">
        ← All orders
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Order &amp; tracking</h1>
      <OrderDetailClient id={id} />
    </main>
  )
}
