"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { ORDER_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"
import { ApiError } from "@/lib/api"
import { commandPath, orderCommandRejectionMessage, type OrderCommandIntent, type OrderCommandKind, type OrderCommandStatus } from "@/lib/order-commands"
import { readOrderIntent, removeOrderIntent, writeOrderIntent } from "@/lib/order-command-storage"
import type { Order } from "@/lib/orders"
import { useOrderCommandDiscovery } from "@/components/orders/order-command-discovery"

export function useOrderCommand(scope: string, onSuccess: (order: Order) => void, onRejected: (message: string) => void) {
  const api = useApi()
  const { user, loading } = useAuth()
  const account = user?.uid
  const identity = account ? `${account}:${scope}` : null
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [intent, setIntent] = useState<OrderCommandIntent | null>(null)
  const [status, setStatus] = useState<OrderCommandStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const session = useRef<string | null>(null)
  const callbacks = useRef({ onSuccess, onRejected })
  const active = useRef<string | null>(null)
  const current = !!identity && loadedIdentity === identity && !loading
  const discovery = useOrderCommandDiscovery()
  const [action, target] = scope.split(":")
  const remote = target ? discovery?.items.find((command) => command.kind?.toLowerCase() === action && command.orderId === target) : undefined
  useEffect(() => { callbacks.current = { onSuccess, onRejected } }, [onSuccess, onRejected])

  useEffect(() => {
    if (!account || loading) return
    let cancelled = false
    session.current = `${account}:${scope}`
    void (async () => {
      try {
        const capability = await api<{ enabled: boolean }>("/api/orders/commands/capabilities")
        const saved = await readOrderIntent(account, scope)
        if (cancelled) return
        setEnabled(capability?.enabled === true)
        setIntent(saved); setStatus(null); setReady(true)
        setLoadedIdentity(`${account}:${scope}`); setSubmitting(false); setMessage(null)
        if (saved) setMessage(capability?.enabled === true ? "Checking the saved request. Please wait."
          : "This deployment cannot resume the saved request yet. It is retained for reconciliation.")
      } catch {
        if (!cancelled) {
          setLoadedIdentity(`${account}:${scope}`); setReady(false); setIntent(null); setStatus(null)
          setMessage("Could not check request recovery. Refresh when the connection is available.")
        }
      }
    })()
    return () => { cancelled = true; session.current = null }
  }, [account, loading, scope, api])

  const receive = useCallback(async (result: OrderCommandStatus) => {
    if (!account || session.current !== `${account}:${scope}`) return
    setStatus(result)
    if (result.status === "COMPLETED") {
      if (result.outcome !== "SUCCESS" && result.outcome !== "REJECTED") throw new Error("Unconfirmed terminal result")
      if (result.outcome === "SUCCESS" && !result.result) throw new Error("Missing saved result")
      await removeOrderIntent(account, scope)
      if (session.current !== `${account}:${scope}`) return
      setIntent(null); setMessage(null)
      if (result.outcome === "SUCCESS") callbacks.current.onSuccess(result.result!)
      else callbacks.current.onRejected(orderCommandRejectionMessage(result))
    } else {
      setMessage(`${result.message ?? "Your request is pending."}${result.attemptCount ? ` Attempt ${result.attemptCount}.` : ""}`)
    }
  }, [account, scope])

  const attempt = useCallback(async (saved: OrderCommandIntent) => {
    try {
      await receive(await api<OrderCommandStatus>(saved.path, { method: "POST", body: saved.body }))
    } catch (error) {
      if (session.current !== `${account}:${scope}`) return
      if (error instanceof ApiError && error.status === 403) {
        // A rejection may precede registration. Confirm no saved effect before
        // clearing this intent; a failed POST alone cannot establish that.
        try {
          const existing = await api<OrderCommandStatus>(`/api/orders/commands/${encodeURIComponent(saved.key)}?userId=${encodeURIComponent(account!)}`)
          await receive(existing)
          return
        } catch (lookupError) {
          if (session.current !== `${account}:${scope}`) return
          if (lookupError instanceof ApiError && lookupError.status === 404) {
            await removeOrderIntent(account!, scope, saved.key)
            if (session.current !== `${account}:${scope}`) return
            setIntent(null); setStatus(null); setMessage(null)
            callbacks.current.onRejected(error.message)
            return
          }
        }
      }
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setStatus({ commandId: saved.key, status: "PENDING", reason: "AUTHORIZATION_REQUIRED" })
        setMessage("Sign in or continue to authorize recovery of this request.")
      } else {
        setMessage("Outcome not confirmed. We are checking this same request; please wait.")
      }
    }
  }, [api, account, scope, receive])

  const check = useCallback(async (signal?: AbortSignal) => {
    // A browser intent exists before the server commits it. Do not race its
    // POST (or resume), even if an already-scheduled callback uses old state.
    if (!current || !intent || !account || active.current === `${account}:${scope}`) return
    try {
      const result = await api<OrderCommandStatus>(`/api/orders/commands/${encodeURIComponent(intent.key)}?userId=${encodeURIComponent(account)}`, { signal })
      await receive(result)
    } catch (error) {
      if (signal?.aborted || session.current !== `${account}:${scope}`) return
      if (error instanceof ApiError && error.status === 404) {
        // Submission might never have arrived. Re-send the FROZEN input/key, never a fresh ID.
        if (enabled) await attempt(intent)
      } else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setStatus({ commandId: intent.key, status: "PENDING", reason: "AUTHORIZATION_REQUIRED" })
        setMessage("Sign in or continue to authorize recovery of this request.")
      }
    }
  }, [current, intent, account, scope, api, receive, attempt, enabled])
  useVisiblePolling(check, current && !!intent && !submitting, ORDER_POLL_INTERVAL_MS)

  async function run(kind: OrderCommandKind, legacyPath: string, body: Record<string, unknown>) {
    if (!current || !account || !ready || active.current === identity || intent || remote || (discovery && !discovery.ready)) return
    active.current = identity; setSubmitting(true)
    try {
      if (!enabled) {
        const result = await api<Order>(legacyPath, { method: "POST", body })
        if (session.current === identity) callbacks.current.onSuccess(result)
        return
      }
      const proposed = { key: String(body.commandId), kind, path: commandPath(kind, legacyPath), body: structuredClone(body) }
      const saved = await writeOrderIntent(account, scope, proposed) ?? proposed
      if (session.current !== `${account}:${scope}`) return
      setIntent(saved); setMessage("Processing your request. Please wait.")
      await attempt(saved)
    } finally {
      if (active.current === identity) active.current = null
      if (session.current === identity) setSubmitting(false)
    }
  }

  async function continueRecovery() {
    if (remote && discovery) { await discovery.resume(remote); return }
    if (!current || !enabled || !intent || !account || active.current === identity || status?.reason !== "AUTHORIZATION_REQUIRED") return
    active.current = identity; setSubmitting(true)
    try {
      const result = await api<OrderCommandStatus>(`/api/orders/commands/${encodeURIComponent(intent.key)}/resume?userId=${encodeURIComponent(account)}`, { method: "POST" })
      await receive(result)
    } catch {
      if (session.current === identity) setMessage("Sign in again to authorize recovery. Your saved request is retained.")
    } finally {
      if (active.current === identity) active.current = null
      if (session.current === identity) setSubmitting(false)
    }
  }

  return { run, ready: current && ready && (!discovery || discovery.ready), pending: current && (!!intent || submitting || !!remote), message: current ? remote ? `${remote.message ?? "Your request is pending."}${remote.attemptCount ? ` Attempt ${remote.attemptCount}.` : ""}` : message : null,
    savedInput: current ? intent?.body : undefined,
    needsAuthorization: current && (remote ? !!discovery?.enabled && !discovery.busy && remote.reason === "AUTHORIZATION_REQUIRED" : enabled && !!intent && status?.reason === "AUTHORIZATION_REQUIRED"), continueRecovery }
}
