/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation assistance for frontend notification grouping.
 */
import type { NotificationItem } from './notification.types'

type NotificationCard = {
  key: string
  latest: NotificationItem
  related?: NotificationItem
}

export function groupNotifications(items: readonly NotificationItem[]): NotificationCard[] {
  const cards: NotificationCard[] = []
  const completions = new Map<string, NotificationCard>()

  // History and live items arrive here in newest-first order.
  for (const item of items) {
    if (item.type === 'ERRAND_COMPLETED' || item.type === 'CREDIT_RECEIVED') {
      const card = completions.get(item.data.errandId)
      if (!card) {
        const newCard = { key: `completion:${item.data.errandId}`, latest: item }
        completions.set(item.data.errandId, newCard)
        cards.push(newCard)
        continue
      }
      if (!card.related && card.latest.type !== item.type) {
        card.related = item
        continue
      }
    }
    cards.push({ key: item.id, latest: item })
  }
  return cards
}
