// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import { getSuppliers, getSuppliersByCategory, searchSuppliers, type Category, type Supplier } from "../api/suppliers"

// Searching and filtering both happen in supplier-service, the UI only asks.
// Its search and category endpoints can't be combined, so picking a
// category clears the search and typing clears the category.
export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<Category | "">("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let stale = false
    const text = query.trim()
    // wait for a pause in typing so we don't send a request per key
    const timer = window.setTimeout(() => {
      setError("")
      const request = text ? searchSuppliers(text)
        : category ? getSuppliersByCategory(category)
        : getSuppliers()
      request
        .then((data) => { if (!stale) setSuppliers(data) })
        .catch(() => { if (!stale) setError("Couldn't load suppliers. Is supplier-service running?") })
    }, text ? 300 : 0)
    return () => { stale = true; window.clearTimeout(timer) }
  }, [query, category, attempt])

  return {
    suppliers,
    error,
    query,
    category,
    search: (text: string) => { setQuery(text); setCategory("") },
    filter: (type: Category | "") => { setCategory(type); setQuery("") },
    retry: () => setAttempt((n) => n + 1),
  }
}