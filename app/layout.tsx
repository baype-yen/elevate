import type { Metadata, Viewport } from 'next'
import { Roboto, Roboto_Slab } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _roboto = Roboto({ subsets: ["latin"], weight: ["300", "400", "500", "700", "900"] });
const _robotoSlab = Roboto_Slab({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: 'Elevate — Personalized Language Learning',
  description: 'Personalized language learning from A1 to C2. Track progress, complete exercises, and elevate your skills.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1B2A4A',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
