"use client"

import { useParams } from "next/navigation"

import { RequireAuth } from "@/components/require-auth"
import { SupplierDetails } from "@/components/suppliers/supplier-details"

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <RequireAuth>
      <SupplierDetails id={id} />
    </RequireAuth>
  )
}
