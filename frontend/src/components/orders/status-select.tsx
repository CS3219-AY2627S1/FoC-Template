"use client"

import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

/** Order-owned native status dropdown; no floating popup or portal. */
export function StatusSelect({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(
    "h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )} />
}
