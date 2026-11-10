import { useCallback, useRef, useState } from 'react'
import type { OrderReview } from '../../api/orderOperations'

export type ReviewDetail = OrderReview & { inspectedAt: string }
type ReviewState = { status: 'loading' } | { status: 'failed'; error: string } | { status: 'ready'; detail: ReviewDetail }
type ReviewAPI = {
  order: { review: (id: string) => Promise<OrderReview> }
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to reach services. Retry using the same request.'

export const useCaseReview = (api: ReviewAPI) => {
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({})
  const active = useRef(false)
  const inspect = useCallback(async (id: string) => {
    if (active.current) return
    active.current = true
    setReviews((current) => ({ ...current, [id]: { status: 'loading' } }))
    try {
      const review = await api.order.review(id)
      setReviews((current) => ({ ...current, [id]: { status: 'ready', detail: { ...review, inspectedAt: new Date().toISOString() } } }))
    } catch (failure) {
      setReviews((current) => ({ ...current, [id]: { status: 'failed', error: errorMessage(failure) } }))
    } finally { active.current = false }
  }, [api])
  const loading = Object.values(reviews).some((review) => review.status === 'loading')
  return { reviews, loading, inspect }
}
