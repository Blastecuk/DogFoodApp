import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'yourdogfood.co.uk',
  description: 'Premium dog food, delivered. Storefront (Next.js + Better Auth).',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
