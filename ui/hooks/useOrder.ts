// AI-assisted (Claude Opus 5.5), 2026-11-12: poll in-progress orders so status/progress stays current; see ui/ai-usage/usage-log.md, entry 002
// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: UI order editing, credit-history details, confirmation wrapping, and regression checks.
// Human review pending. Exact prompts and verification: ui/ai-usage/ui-order-fix.md.
// ChatGPT (Codex), 2026-11-03: Single-order retrieval with approved visibility rules; review pending; see order-service/usage-log.md.
// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import type { Order } from "../App"
import { getOrder, orderError, updateOrder, type OrderAction } from "../api/orders"

const POLL_MS = 10_000

// Refresh details from the backend, then run lifecycle actions.
export function useOrder(initial: Order) {
  const [order, setOrder] = useState(initial)
  const [actionError, setActionError] = useState("")
  const [busy, setBusy] = useState(false)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError("")
    getOrder(initial.id, controller.signal)
      .then(updated => { if (!controller.signal.aborted) setOrder(updated) })
      .catch(error => { if (!controller.signal.aborted) setLoadError(orderError(error)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initial.id])

  // The other person moves the order along (courier picks up, delivers), so
  // keep checking while it's still in progress. Otherwise the progress bar
  // only changes for whoever pressed the button.
  const inProgress = order.status === "open" || order.status === "accepted" || order.status === "picked-up"
  useEffect(() => {
    if (!inProgress || loadError) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      getOrder(initial.id).then(setOrder).catch(() => {})
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [initial.id, inProgress, loadError])

  // returns the updated order, or null if it failed (error is shown on the page)
  const run = async (action: OrderAction) => {
    if (loading || loadError || busy) return null
    setBusy(true)
    setActionError("")
    try {
      const updated = await updateOrder(order.id, action)
      setOrder(updated)
      return updated
    } catch (err) {
      setActionError(orderError(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  return { order, setOrder, actionError, busy: busy || loading, loadError, run }
}