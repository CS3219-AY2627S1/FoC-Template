import axios from 'axios'
import { getSupplier, type Supplier } from '@/api/supplier'

// one lookup per supplier per page load, shared by every errand card
const cache = new Map<number, Promise<Supplier | null>>()

/**
 * The supplier behind an errand's pickup, e.g. for its photo.
 * Resolves to null if it no longer exists (deleted suppliers return 404).
 * Other failures are not cached, so the next caller tries again.
 */
export function getSupplierCached (id: number): Promise<Supplier | null> {
  let lookup = cache.get(id)
  if (!lookup) {
    lookup = getSupplier(id).catch((error: unknown) => {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status !== 404) {
        cache.delete(id)
      }
      return null
    })
    cache.set(id, lookup)
  }
  return lookup
}
