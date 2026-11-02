"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { ORDER_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"
import { invalidateCreditBalance } from "@/lib/credit-balance-events"
import { orderCommandRejectionMessage, type OrderCommandStatus } from "@/lib/order-commands"
import { removeOrderIntent } from "@/lib/order-command-storage"

type Discovery = {
  items: OrderCommandStatus[]
  ready: boolean
  enabled: boolean
  busy: string | null
  resume: (command: OrderCommandStatus) => Promise<void>
}
const Context = createContext<Discovery | null>(null)
export const useOrderCommandDiscovery = () => useContext(Context)
export function confirmedTerminal(command: OrderCommandStatus) {
  return command.status === "COMPLETED" && (command.outcome === "REJECTED" || (command.outcome === "SUCCESS" && !!command.result))
}

/** One owned discovery poll per board. Unknown remote input is never invented or re-submitted. */
export function OrderCommandDiscoveryProvider({ children, onResolved }: { children: React.ReactNode; onResolved: () => void }) {
  const api = useApi()
  const { user, loading } = useAuth()
  const account = !loading ? user?.uid : undefined
  const [saved, setSaved] = useState<{ account: string; items: OrderCommandStatus[]; enabled: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const session = useRef<string | undefined>(undefined)
  const epoch = useRef(0)
  const cache = useRef<{ account: string; items: OrderCommandStatus[] } | null>(null)
  const active = useRef<string | null>(null)
  const completed = useRef(new Set<string>())
  const resolved = useRef(onResolved)
  useEffect(() => { resolved.current = onResolved }, [onResolved])
  useEffect(() => {
    const generation = ++epoch.current
    session.current = account
    cache.current = null
    completed.current = new Set()
    active.current = null
    return () => { epoch.current = generation + 1; session.current = undefined }
  }, [account])

  const finish = useCallback(async (command: OrderCommandStatus, owner: string) => {
    if (session.current !== owner || !confirmedTerminal(command) || completed.current.has(command.commandId)) return
    completed.current.add(command.commandId)
    const generation = epoch.current
    const scope = command.kind === "CREATE" ? "create" : command.kind && command.orderId ? `${command.kind.toLowerCase()}:${command.orderId}` : null
    if (scope) {
      try { await removeOrderIntent(owner, scope, command.commandId) }
      catch { /* Missing/unavailable browser storage cannot undo a confirmed server result. */ }
    }
    if (session.current !== owner || epoch.current !== generation) return
    invalidateCreditBalance()
    if (command.outcome === "REJECTED") toast.error(orderCommandRejectionMessage(command))
    else toast.success(command.kind === "ACCEPT" ? "Errand accepted" : command.kind === "ABORT" ? "Errand aborted" : command.kind === "REPOST" ? "Order reposted" : "Request posted")
    resolved.current()
  }, [])
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!account) return
    const generation = epoch.current
    try {
      const capability = await api<{ enabled: boolean }>("/api/orders/commands/capabilities", { signal })
      const found: OrderCommandStatus[] = []
      let pages = 1
      for (let page = 1; page <= pages; page++) {
        const result = await api<{ items: OrderCommandStatus[]; totalPages: number }>(
          `/api/orders/commands?userId=${encodeURIComponent(account)}&page=${page}&size=100`, { signal })
        if (signal?.aborted || session.current !== account || epoch.current !== generation) return
        found.push(...(result.items ?? []).filter((item) => item.status === "PENDING"))
        pages = Math.max(1, result.totalPages ?? 1)
      }
      const pending = new Map(found.map((item) => [item.commandId, item]))
      for (const old of cache.current?.account === account ? cache.current.items : []) {
        if (pending.has(old.commandId) || completed.current.has(old.commandId)) continue
        try {
          const result = await api<OrderCommandStatus>(`/api/orders/commands/${encodeURIComponent(old.commandId)}?userId=${encodeURIComponent(account)}`, { signal })
          if (signal?.aborted || session.current !== account || epoch.current !== generation) return
          if (result.commandId !== old.commandId) { pending.set(old.commandId, old); continue }
          if (confirmedTerminal(result)) await finish(result, account)
          else pending.set(old.commandId, result.status === "PENDING" ? result : old)
        } catch { pending.set(old.commandId, old) }
      }
      if (signal?.aborted || session.current !== account || epoch.current !== generation) return
      const items = [...pending.values()].filter((item) => !completed.current.has(item.commandId))
      cache.current = { account, items }
      setSaved({ account, items, enabled: capability.enabled === true })
    } catch { /* Failed discovery cannot resolve or erase a known financial command. */ }
  }, [account, api, finish])
  useVisiblePolling(refresh, !!account, ORDER_POLL_INTERVAL_MS)

  async function resume(command: OrderCommandStatus) {
    if (!account || saved?.account !== account || !saved.enabled || active.current || command.reason !== "AUTHORIZATION_REQUIRED") return
    const claim = `${account}:${command.commandId}`
    const generation = epoch.current
    active.current = claim; setBusy(command.commandId)
    try {
      const result = await api<OrderCommandStatus>(`/api/orders/commands/${encodeURIComponent(command.commandId)}/resume?userId=${encodeURIComponent(account)}`, { method: "POST" })
      if (session.current !== account || epoch.current !== generation || result.commandId !== command.commandId) return
      const previous = cache.current?.account === account ? cache.current.items : []
      if (confirmedTerminal(result)) await finish(result, account)
      if (session.current !== account || epoch.current !== generation) return
      const items = previous.flatMap((item) => item.commandId !== command.commandId ? [item] : confirmedTerminal(result) ? [] : result.status === "PENDING" ? [result] : [item])
      cache.current = { account, items }
      setSaved({ account, items, enabled: true })
    } catch { /* Retain the same command for user-assisted authorization. */ }
    finally { if (epoch.current === generation && active.current === claim) { active.current = null; setBusy(null) } }
  }
  const current = !!account && saved?.account === account
  return <Context.Provider value={{ items: current ? saved.items : [], ready: current, enabled: current && saved.enabled,
    busy: current ? busy : null, resume }}>{children}</Context.Provider>
}
