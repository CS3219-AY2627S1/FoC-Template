import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isReportContext } from './cases'

const orderId = '10000000-0000-4000-8000-000000000001'
const caseId = '20000000-0000-4000-8000-000000000001'
// Read only when the tests run; the service-only Docker context does not contain root docs.
const contextBranches: {
  properties: {
    status: { enum: string[] }
    caseId: { type: string }
    state: { type: string }
  }
}[] = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../docs/contracts/n2h.openapi.json'),
    'utf8',
  ),
).components.schemas.ReportContext.oneOf
const published = contextBranches.flatMap((branch) =>
  branch.properties.status.enum.map((status) => ({
    orderId,
    status,
    caseId: branch.properties.caseId.type === 'null' ? null : caseId,
    state: branch.properties.state.type === 'null' ? null : 'OPEN',
  })),
)
it.each(published)('accepts the producer schema context $status', (value) => {
  expect(isReportContext(value, orderId)).toBe(true)
  expect(isReportContext({ ...value, orderId: caseId }, orderId)).toBe(false)
  expect(
    isReportContext(
      { ...value, caseId: value.caseId ? null : caseId },
      orderId,
    ),
  ).toBe(false)
})
it('retains only the documented rollout aliases', () => {
  for (const status of ['PREPARATION_AVAILABLE', 'ELIGIBLE', 'INELIGIBLE'])
    expect(
      isReportContext({ orderId, status, caseId: null, state: null }, orderId),
    ).toBe(true)
  expect(
    isReportContext(
      { orderId, status: 'UNSUPPORTED', caseId: null, state: null },
      orderId,
    ),
  ).toBe(false)
})
