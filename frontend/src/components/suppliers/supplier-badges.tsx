import { Badge } from "@/components/ui/badge"
import type { Supplier } from "@/lib/suppliers"

export function SupplierBadges({ supplier }: { supplier: Pick<Supplier, "active" | "openNow"> }) {
  if (!supplier.active) {
    return <Badge variant="destructive">Inactive</Badge>
  }
  return supplier.openNow ? (
    <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">Open now</Badge>
  ) : (
    <Badge variant="secondary">Closed</Badge>
  )
}
