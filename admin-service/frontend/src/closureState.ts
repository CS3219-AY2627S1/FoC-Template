import { isUuid } from './cases'

export type ClosureSubmission = {
  key: string
  body: {
    resolution: string
    creditDisposition?: string
    expectedRevision: number
    rejectedActionExplanations: { operationId: string; explanation: string }[]
  }
}
export function readPendingClosure(
  actor: string,
  caseId: string,
): ClosureSubmission | null {
  try {
    const p = JSON.parse(
      sessionStorage.getItem(`foc.resolve-pending.${actor}.${caseId}`) ||
        'null',
    ) as ClosureSubmission | null
    return p &&
      isUuid(p.key) &&
      typeof p.body.resolution === 'string' &&
      Number.isSafeInteger(p.body.expectedRevision) &&
      Array.isArray(p.body.rejectedActionExplanations)
      ? p
      : null
  } catch {
    return null
  }
}
