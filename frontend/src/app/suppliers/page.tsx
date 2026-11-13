import type { Metadata } from "next"
import { Suspense } from "react"

import { RequireAuth } from "@/components/require-auth"
import { SupplierBrowser } from "@/components/suppliers/supplier-browser"

export const metadata: Metadata = { title: "Suppliers" }

export default function SuppliersPage() {
  return (
    <RequireAuth>
      <Suspense>
        <SupplierBrowser />
      </Suspense>
    </RequireAuth>
  )
}
