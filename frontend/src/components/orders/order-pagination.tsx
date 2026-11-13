"use client"

import { Button } from "@/components/ui/button"

export function OrderPagination({ page, totalPages, disabled, onChange }: {
  page: number
  totalPages: number
  disabled: boolean
  onChange: (page: number) => void
}) {
  if (totalPages <= 1 && page === 1) return null

  return (
    <nav aria-label="Order pages" className="flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground">Page {page} of {Math.max(1, totalPages)}</span>
      <Button variant="outline" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  )
}
