import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { type CreditHold, getBalance, listHolds } from '@/api/credit'
import { useAuthStore } from '@/stores/auth'

// the signed-in user's credits, shared by the app bar and the dashboard
export const useCreditStore = defineStore('credit', () => {
  const auth = useAuthStore()

  // null until loaded, or when there is no credit account yet
  const balance = ref<number | null>(null)
  const holds = ref<CreditHold[]>([])
  // "missing": no credit account yet (made when the user registers); "error": the credit service failed
  const problem = ref<'missing' | 'error' | null>(null)
  const isLoading = ref(false)

  const activeHolds = computed(() => holds.value.filter(h => h.status === 'HELD'))
  const onHold = computed(() => activeHolds.value.reduce((sum, h) => sum + h.amount, 0))

  const refresh = async () => {
    const userId = auth.userId
    if (!userId || isLoading.value) {
      return
    }

    isLoading.value = true
    try {
      const [account, userHolds] = await Promise.all([getBalance(userId), listHolds(userId)])
      balance.value = account.balance
      holds.value = userHolds
      problem.value = null
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      problem.value = status === 404 ? 'missing' : 'error'
      balance.value = null
      holds.value = []
      if (status !== 404) {
        console.error('Error loading credits', error)
      }
    } finally {
      isLoading.value = false
    }
  }

  return { balance, holds, activeHolds, onHold, problem, isLoading, refresh }
})
