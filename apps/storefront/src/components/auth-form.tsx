'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signIn, signUp } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'login' | 'create-account' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const isSignUp = mode === 'create-account'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error } = isSignUp
      ? await signUp.email({ name, email, password })
      : await signIn.email({ email, password })
    setPending(false)
    if (error) {
      setError(error.message ?? 'Something went wrong')
      return
    }
    router.push('/account')
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold">
        {isSignUp ? 'Create your account' : 'Welcome back'}
      </h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {isSignUp && (
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        )}
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          required
          minLength={8}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {isSignUp ? 'Already have an account? ' : 'Need an account? '}
        <Link
          href={isSignUp ? '/login' : '/create-account'}
          className="font-semibold text-indigo-600"
        >
          {isSignUp ? 'Log in' : 'Create account'}
        </Link>
      </p>
    </div>
  )
}
