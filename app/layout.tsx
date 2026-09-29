import React from "react"
import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google"
import { AppNav } from "@/components/app-nav"
import "./globals.css"

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" })
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" })
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source-serif" })

export const metadata: Metadata = {
  title: "Impact Ledger",
  description: "What every feature cost, what it proved, and what we decided: feature ROI with honest statistics.",
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${serif.variable}`}>
      <body className="font-sans antialiased">
        <AppNav />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">{children}</main>
      </body>
    </html>
  )
}
