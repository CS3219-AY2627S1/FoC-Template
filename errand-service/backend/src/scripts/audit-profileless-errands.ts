// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the profileless-errand audit script.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { ErrandRepository, type ErrandAuditRow } from '../repositories/errand.repository.js'
import { getEnv } from '../config/env.js'

type UserDeletionStatus = {
  profileExists: boolean
  deletionEventExists: boolean
  identityExists: boolean | null
}

type AuditEntry = {
  requesterSub: string
  classification:
    | 'legitimately-deleted'
    | 'legacy-profile-never-created'
    | 'inconsistent-data'
    | 'needs-manual-classification'
  deletionEventExists: boolean
  identityExists: boolean | null
  errands: ErrandAuditRow[]
  openErrandIds: string[]
  assignedErrandIds: string[]
  remediatedOpenErrandIds: string[]
  resolvedAssignedErrandIds: string[]
}

const args = new Set(process.argv.slice(2))
const remediateOpen = args.has('--remediate-open')
const resolveAssigned = args.has('--resolve-assigned')
const env = getEnv()
const repository = new ErrandRepository()

async function getDeletionStatus(requesterSub: string): Promise<UserDeletionStatus> {
  const response = await fetch(
    `${env.userApiUrl}/internal/user/deletion-status/${encodeURIComponent(requesterSub)}`,
    {
      headers: { 'x-user-service-token': env.userServiceInternalToken },
      signal: AbortSignal.timeout(env.timeoutMs),
    },
  )
  if (!response.ok) {
    throw new Error(`User Service deletion-status lookup failed for ${requesterSub}: HTTP ${response.status}`)
  }
  const body = (await response.json()) as { ok?: boolean; data?: UserDeletionStatus }
  if (!body.ok || !body.data) throw new Error(`Invalid deletion-status response for ${requesterSub}`)
  return body.data
}

try {
  const entries: AuditEntry[] = []
  for (const requesterSub of await repository.listRequesterSubjects()) {
    const status = await getDeletionStatus(requesterSub)
    if (status.profileExists) continue

    const errands = await repository.listErrandsForAudit(requesterSub)
    const openErrandIds = errands
      .filter((errand) => errand.status === 'OPEN')
      .map((errand) => errand.id)
    const assignedErrandIds = errands
      .filter((errand) => ['ACCEPTED', 'PICKED_UP', 'DELIVERED'].includes(errand.status))
      .map((errand) => errand.id)

    const entry: AuditEntry = {
      requesterSub,
      classification: status.deletionEventExists
        ? 'legitimately-deleted'
        : status.identityExists === true
          ? 'legacy-profile-never-created'
          : status.identityExists === false
            ? 'inconsistent-data'
            : 'needs-manual-classification',
      deletionEventExists: status.deletionEventExists,
      identityExists: status.identityExists,
      errands,
      openErrandIds,
      assignedErrandIds,
      remediatedOpenErrandIds: [],
      resolvedAssignedErrandIds: [],
    }

    if (remediateOpen && openErrandIds.length > 0) {
      await repository.remediateProfilelessOpenErrands(requesterSub)
    }

    if (resolveAssigned && assignedErrandIds.length > 0) {
      await repository.handleRequesterDeleted(requesterSub)
    }

    const finalRows = await repository.listErrandsForAudit(requesterSub)
    entry.remediatedOpenErrandIds = openErrandIds.filter(
      (id) => finalRows.find((errand) => errand.id === id)?.status !== 'OPEN',
    )
    entry.resolvedAssignedErrandIds = assignedErrandIds.filter((id) => {
      const status = finalRows.find((errand) => errand.id === id)?.status
      return status !== undefined && !['ACCEPTED', 'PICKED_UP', 'DELIVERED'].includes(status)
    })

    entries.push(entry)
  }

  const unresolved = entries.filter(
    (entry) =>
      (entry.openErrandIds.length > entry.remediatedOpenErrandIds.length ||
        entry.assignedErrandIds.some((id) => !entry.resolvedAssignedErrandIds.includes(id))),
  )

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    remediation: { remediateOpen, resolveAssigned },
    entries,
    unresolvedCount: unresolved.length,
  }, null, 2))

  if (unresolved.length > 0) {
    console.error('Audit incomplete: manually classify and resolve the reported profile-less errands before enabling the acceptance guard.')
    process.exitCode = 2
  }
} finally {
  await repository.disconnect()
}
