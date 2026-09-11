import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { getSession } from '@/lib/session'

export default async function CreateAccountPage() {
  const session = await getSession()
  if (session) redirect('/account')
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <AuthForm mode="create-account" />
    </main>
  )
}
