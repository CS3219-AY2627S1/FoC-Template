import type { Timeline } from './EvidencePanel'

export type ParticipantSelection = { userId: string; request: number }

export function participantLabels(
  participants: Timeline['participants'],
  names: Record<string, string> = {},
) {
  const couriers = [
    ...new Set(
      participants
        .filter((p) => p.relationship === 'HISTORICAL_COURIER')
        .map((p) => p.userId),
    ),
  ].sort()
  return (id: string) => {
    const roles: string[] = []
    if (
      participants.some(
        (p) => p.userId === id && p.relationship === 'REQUESTER',
      )
    )
      roles.push('Requester')
    const courier = couriers.indexOf(id)
    if (courier >= 0)
      roles.push(names[id] ? 'Courier' : `Courier ${courier + 1}`)
    return (
      (roles.length
        ? `${roles.join(' · ')}${names[id] ? ` [${names[id]}]` : ''}`
        : '') || 'Account not identified in available participant history'
    )
  }
}
