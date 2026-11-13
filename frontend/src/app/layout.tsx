import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { connection } from "next/server"

import { AppShell } from "@/components/app-shell"
import { AuthProvider } from "@/components/providers/auth-provider"
import { ConfigProvider } from "@/components/providers/config-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { readPublicConfig } from "@/lib/runtime-config"
import "./globals.css"

// shadcn/ui's theme (globals.css) reads the UI font from --font-sans.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: { default: "Friend on Campus", template: "%s · Friend on Campus" },
  description: "Peer-to-peer campus errands on a closed credit economy.",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Opt into request-time rendering so configuration comes from the container's
  // environment rather than being baked in at build time.
  await connection()
  const config = readPublicConfig()

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <ConfigProvider config={config}>
          <AuthProvider>
            <TooltipProvider>
              <AppShell>{children}</AppShell>
              <Toaster richColors position="top-center" />
            </TooltipProvider>
          </AuthProvider>
        </ConfigProvider>
      </body>
    </html>
  )
}
