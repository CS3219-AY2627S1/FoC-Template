"use client"

import { useEffect, useState } from "react"

import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import type { SupplierPermissions } from "@/lib/suppliers"

type PermissionState = {
  userId: string
  permissions: SupplierPermissions | null
  error: string | null
}

/**
 * What the signed-in user may do in the Supplier Service. Only used to show or hide
 * controls; the service enforces the same rules on every request. Roles come from the
 * User Service, so the check can fail (503) while it is unavailable: `error` is then set
 * and `canManage` stays false.
 */
export function useSupplierPermissions() {
  const api = useApi()
  const { user, loading: authLoading } = useAuth()
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null)

  useEffect(() => {
    if (authLoading || !user) return

    const controller = new AbortController()
    api<SupplierPermissions>("/api/suppliers/permissions", { signal: controller.signal })
      .then((nextPermissions) => {
        setPermissionState({ userId: user.uid, permissions: nextPermissions, error: null })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setPermissionState({
          userId: user.uid,
          permissions: null,
          error: error instanceof Error ? error.message : "Could not check your permissions.",
        })
      })
    return () => controller.abort()
  }, [api, authLoading, user])

  // Associate the result with the Firebase user that was queried. This prevents
  // a previous user's permissions from being shown while auth is changing or
  // while the current user's request is still in flight.
  const current = authLoading || !user || permissionState?.userId !== user.uid ? null : permissionState
  const visiblePermissions = current?.permissions ?? null

  return {
    permissions: visiblePermissions,
    canManage: visiblePermissions?.canManageSuppliers ?? false,
    loading: current === null,
    error: current?.error ?? null,
  }
}
