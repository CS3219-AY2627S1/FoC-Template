"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, ClockIcon, MapPinIcon, NavigationIcon } from "lucide-react"

import { SupplierBadges } from "@/components/suppliers/supplier-badges"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDistance, formatHours, formatLocation, type Supplier } from "@/lib/suppliers"

/** Table on md+ screens, cards on phones: same data and the same single tap to open a supplier. */
export function SupplierResults({ suppliers, showDistance }: { suppliers: Supplier[]; showDistance: boolean }) {
  const router = useRouter()

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Hours</TableHead>
              {showDistance && <TableHead className="text-right">Distance</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => router.push(`/suppliers/${s.id}`)}
              >
                <TableCell className="font-medium">
                  <Link href={`/suppliers/${s.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{s.type}</Badge>
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{formatLocation(s)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatHours(s)}</TableCell>
                {showDistance && (
                  <TableCell className="text-right tabular-nums">{formatDistance(s.distanceMeters)}</TableCell>
                )}
                <TableCell>
                  <SupplierBadges supplier={s} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {suppliers.map((s) => (
          <li key={s.id}>
            <Link href={`/suppliers/${s.id}`} className="block rounded-xl focus-visible:outline-none">
              <Card className="transition-colors active:bg-muted/60">
                <CardContent className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <SupplierBadges supplier={s} />
                    </div>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPinIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{formatLocation(s)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <ClockIcon className="size-3.5" />
                        {formatHours(s)}
                      </span>
                      {showDistance && s.distanceMeters !== undefined && (
                        <span className="flex items-center gap-1.5">
                          <NavigationIcon className="size-3.5" />
                          {formatDistance(s.distanceMeters)}
                        </span>
                      )}
                    </span>
                    <Badge variant="outline" className="w-fit">
                      {s.type}
                    </Badge>
                  </div>
                  <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export function SupplierResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading suppliers">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}
