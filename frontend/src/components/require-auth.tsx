"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { useAuth } from "@/components/providers/auth-provider"
import { Skeleton } from "@/components/ui/skeleton"

// UX guard only: every backend service still authenticates and authorises each request.
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [loading, user, router, pathname])

  if (loading || !user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  return children
}
