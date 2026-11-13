"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { useAdminApi } from "@/hooks/use-admin-api"

type Access = { userId: string; allowed: boolean; checking: boolean; error: string | null }
type AdminMode = {
  allowed: boolean
  checking: boolean
  error: string | null
  enter: () => Promise<boolean>
  leave: () => void
}

const AdminContext = createContext<AdminMode | null>(null)

export function AdminModeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const api = useAdminApi()
  const pathname = usePathname()
  const router = useRouter()
  const [access, setAccess] = useState<Access | null>(null)
  const generation = useRef(0)
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/")
  const uid = user?.uid
  const current = !loading && uid && access?.userId === uid ? access : null
  const allowed = current?.allowed ?? false

  useEffect(() => {
    return () => { generation.current += 1 }
  }, [uid])

  const check = useCallback((signal?: AbortSignal) => {
    if (loading || !uid) return Promise.resolve(false)
    const requestGeneration = ++generation.current
    return api.roleContext(uid, signal).then((roles) => {
      if (signal?.aborted || requestGeneration !== generation.current) return false
      const permitted = roles.userId === uid && roles.roles.includes("admin")
      setAccess({ userId: uid, allowed: permitted, checking: false,
        error: permitted ? null : "Only administrators can enter Admin Mode." })
      return permitted
    }).catch((error: unknown) => {
      if (signal?.aborted || requestGeneration !== generation.current) return false
      setAccess({ userId: uid, allowed: false, checking: false,
        error: error instanceof Error ? error.message : "Could not check administrator access." })
      return false
    })
  }, [api, loading, uid])

  useEffect(() => {
    if (!adminRoute || loading || !uid) return
    const controller = new AbortController()
    void check(controller.signal)
    return () => controller.abort()
  }, [adminRoute, check, loading, uid])

  const enter = async () => {
    if (!loading && uid) setAccess({ userId: uid, allowed: false, checking: true, error: null })
    const permitted = await check()
    if (permitted) router.push("/admin/orders")
    return permitted
  }
  const leave = () => {
    generation.current += 1
    setAccess(null)
    router.push("/")
  }

  return <AdminContext.Provider value={{
    allowed, checking: loading || current?.checking === true || (adminRoute && current === null),
    error: current?.error ?? null, enter, leave,
  }}>{children}</AdminContext.Provider>
}

export function useAdminMode() {
  const context = useContext(AdminContext)
  if (!context) throw new Error("AdminModeProvider is required.")
  return context
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { allowed, checking, error, leave } = useAdminMode()
  if (checking) return <p className="p-6 text-sm text-muted-foreground" role="status">Checking administrator access…</p>
  if (!allowed) return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Admin access unavailable</h1>
      <p role="alert" className="text-sm text-muted-foreground">{error ?? "Administrator verification is required."}</p>
      <Button onClick={leave}>Back to normal mode</Button>
    </div>
  )
  return children
}
