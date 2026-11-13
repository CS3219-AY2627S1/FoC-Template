import type { Order } from '@/api/order'
import { onUnmounted, ref, watch } from 'vue'
import { msUntilNextExpiry } from '@/util/order'

/**
 * The current time as a ref, ticking every second, for countdowns like "Expires in 45s".
 * Only the time text re-renders; data is refreshed separately by each page.
 */
export function useClock (intervalMs = 1000) {
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), intervalMs)
  onUnmounted(() => clearInterval(timer))
  return now
}

/**
 * Calls reload just after the soonest open errand shown on the page expires, so its
 * new status (EXPIRED) and the remaining list appear straight away instead of at the
 * next periodic refresh. Re-schedules whenever the shown errands change.
 */
export function useExpiryReload (orders: () => Order[], reload: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(orders, list => {
    clearTimeout(timer)
    const delay = msUntilNextExpiry(list)
    if (delay !== null) {
      // a little after the expiry time, so the order service already sees it as expired
      timer = setTimeout(reload, delay + 1000)
    }
  }, { immediate: true })
  onUnmounted(() => clearTimeout(timer))
}
