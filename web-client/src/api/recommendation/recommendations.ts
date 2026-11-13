import { useMutation } from '@tanstack/react-query'
import { request } from '@/lib/http'

export type RecommendationBasis = 'formula' | 'default'

// Mirrors recommendation-service POST /recommendations response.
export type Recommendation = {
  recommendedCredits: number
  basis: RecommendationBasis
  version: string
  features: {
    marketRate: number
    weights: { a: number; b: number; c: number }
    items: number
    avgItems: number
    itemFactor: number
    urgency: number
    urgencyFactor: number
    distance: number
    avgDist: number
    distanceFactor: number
    multiplier: number
  }
}

export type RecommendationInput = {
  supplierId: string
  location: string
  neededBy: string
  items: string[]
}

export function useRecommendation() {
  return useMutation({
    mutationFn: (input: RecommendationInput) =>
      request<Recommendation>('recommendation', '/recommendations', { method: 'POST', body: input }),
  })
}
