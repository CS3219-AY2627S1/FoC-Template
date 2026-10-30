// AI-assisted (Claude), reviewed and tested by Maliha
import { useState } from "react"
import type { Order } from "../App"
import { orderError, updateOrder, type OrderAction } from "../api/orders"

// Holds one order and runs accept / pickup / deliver / cancel on it.
// order-service has no single-order endpoint, so the page starts from the
// order the list already loaded, and each action returns the updated one.
// Used by the details page and the active errand page.
export function useOrder(initial: Order) {
  const [order, setOrder] = useState(initial)
  const [actionError, setActionError] = useState("")
  const [busy, setBusy] = useState(false)

  // returns the updated order, or null if it failed (error is shown on the page)
  const run = async (action: OrderAction) => {
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

  return { order, actionError, busy, run }
}