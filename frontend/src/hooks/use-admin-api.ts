"use client"

import { useMemo } from "react"
import { useApi } from "@/hooks/use-api"
import { createAdminApi } from "@/lib/admin-api"

export function useAdminApi() {
  const request = useApi()
  return useMemo(() => createAdminApi(request), [request])
}
