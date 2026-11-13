/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated code for frontend for credit transaction history rendering and interactions.
 * Author review: I reviewed for correctness and edited where needed.
 */

"use client"

import { useState } from "react"
import { HistoryIcon, RefreshCwIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCreditTransactions } from "@/hooks/use-credit-transactions"
import {
  CREDIT_TRANSACTION_LABELS,
  type CreditTransaction,
  type CreditTransactionType,
} from "@/lib/credit-transactions"
import { cn } from "@/lib/utils"

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

function typeClasses(type: CreditTransactionType) {
  if (type === "RESERVATION") return "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  if (type === "PAID") return "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-300"
  return "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

function amountClasses(transaction: CreditTransaction) {
  if (transaction.type === "RESERVATION") return "text-amber-700 dark:text-amber-300"
  return transaction.direction === "CREDIT"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-red-700 dark:text-red-300"
}

function TransactionTypeBadge({ type }: { type: CreditTransactionType }) {
  return <Badge variant="outline" className={typeClasses(type)}>{CREDIT_TRANSACTION_LABELS[type]}</Badge>
}

function SignedAmount({ transaction }: { transaction: CreditTransaction }) {
  const sign = transaction.direction === "CREDIT" ? "+" : "−"
  return <span className={cn("font-medium tabular-nums", amountClasses(transaction))}>{sign}{transaction.amount} credits</span>
}

function TransactionRows({ items }: { items: CreditTransaction[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader><TableRow><TableHead>Date and time</TableHead><TableHead>Type</TableHead><TableHead>Order ID</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((transaction) => (
              <TableRow key={transaction.transactionId}>
                <TableCell>{DATE_FORMAT.format(new Date(transaction.occurredAt))}</TableCell>
                <TableCell><TransactionTypeBadge type={transaction.type} /></TableCell>
                <TableCell className="max-w-56 truncate font-mono text-xs" title={transaction.orderId ?? undefined}>{transaction.orderId ?? "—"}</TableCell>
                <TableCell className="text-right"><SignedAmount transaction={transaction} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y md:hidden">
        {items.map((transaction) => (
          <article key={transaction.transactionId} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2"><TransactionTypeBadge type={transaction.type} /><SignedAmount transaction={transaction} /></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Date</dt><dd className="text-right">{DATE_FORMAT.format(new Date(transaction.occurredAt))}</dd>
              <dt className="text-muted-foreground">Order ID</dt><dd className="break-all text-right font-mono text-xs">{transaction.orderId ?? "—"}</dd>
            </dl>
          </article>
        ))}
      </div>
    </>
  )
}

export function TransactionHistory() {
  const [page, setPage] = useState(1)
  const state = useCreditTransactions(page)
  return <TransactionHistoryView {...state} page={page} onPage={setPage} />
}

/** Shared presentation: normal Profile and Admin use separate authorized data loaders. */
export function TransactionHistoryView({ items, totalItems, totalPages, error, loading, refreshing, refresh, page, onPage }: {
  items: CreditTransaction[]; totalItems: number; totalPages: number; error: boolean
  loading: boolean; refreshing: boolean; refresh: () => void; page: number; onPage: (page: number) => void
}) {

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Credit transactions</CardTitle>
        <CardDescription>{totalItems > 0 ? `${totalItems} transaction${totalItems === 1 ? "" : "s"}` : "Your credit activity appears here."}</CardDescription>
        <CardAction><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}><RefreshCwIcon className={cn(refreshing && "animate-spin")} />Refresh</Button></CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert variant="destructive"><AlertTitle>Transactions could not be refreshed</AlertTitle><AlertDescription>{items.length > 0 ? "Showing the most recent records already loaded." : "Check your connection and try again."}</AlertDescription></Alert>}
        {loading ? (
          <div aria-label="Loading credit transactions" className="space-y-3">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-12 w-full" />)}</div>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader><EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia><EmptyTitle>No credit transactions</EmptyTitle><EmptyDescription>Your allocations, reservations, payments, receipts, and refunds will appear here.</EmptyDescription></EmptyHeader>
            {error && <Button variant="outline" onClick={() => void refresh()}>Try again</Button>}
          </Empty>
        ) : <TransactionRows items={items} />}
        {(totalPages > 1 || page > 1) && (
          <nav aria-label="Credit transaction pages" className="flex flex-wrap items-center justify-center gap-3 border-t pt-4">
            <Button variant="outline" disabled={refreshing || page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {Math.max(1, totalPages)}</span>
            <Button variant="outline" disabled={refreshing || page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
          </nav>
        )}
      </CardContent>
    </Card>
  )
}
